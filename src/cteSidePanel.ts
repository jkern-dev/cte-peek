import * as vscode from 'vscode';
import { getCachedCtes } from './cteCache';
import { CteParseResult } from './cteParser';

// ── Preview provider (read-only virtual documents) ──────────────────

export class CtePreviewProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private docs = new Map<string, { cteName: string; content: string }>();
  private languageSet = new Set<string>();

  getUri(depth: number): vscode.Uri {
    return vscode.Uri.parse(`cte-peek:/CTE Preview ${depth + 1}.sql`);
  }

  updateAt(depth: number, name: string, body: string): boolean {
    const uri = this.getUri(depth);
    const key = uri.toString();
    const existing = this.docs.get(key);
    if (existing && existing.cteName === name.toLowerCase()) return false;
    this.docs.set(key, {
      cteName: name.toLowerCase(),
      content: `-- CTE: ${name}\n\n${body}\n`,
    });
    this._onDidChange.fire(uri);
    return true;
  }

  clearFrom(depth: number): void {
    // Remove all documents at depth and beyond
    for (let d = depth; d < 20; d++) {
      const key = this.getUri(d).toString();
      if (!this.docs.has(key)) break;
      this.docs.delete(key);
    }
  }

  /** Returns the depth index for a given URI, or -1 if not found. */
  depthOf(uri: vscode.Uri): number {
    const str = uri.toString();
    for (let d = 0; d < 20; d++) {
      if (this.getUri(d).toString() === str) return d;
    }
    return -1;
  }

  async ensureLanguage(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (this.languageSet.has(key)) return;
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(doc, 'sql');
    this.languageSet.add(key);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.toString())?.content ?? '';
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('sqlCtePeek');
  return {
    mode: cfg.get<string>('displayMode', 'side-panel'),
    maxDepth: cfg.get<number>('maxNestingDepth', 3),
  };
}

// ── Panel stack ─────────────────────────────────────────────────────

interface PanelEntry {
  viewColumn: vscode.ViewColumn;
  cteName: string;          // lowercase
  previewUri?: string;      // set in preview mode
}

// ── Selection listener ──────────────────────────────────────────────

export function setupSelectionListener(
  context: vscode.ExtensionContext,
  previewProvider: CtePreviewProvider,
  supportedLanguages: string[]
): void {
  let sourceDocUri = '';
  let sourceViewColumn: vscode.ViewColumn | undefined;
  const panelStack: PanelEntry[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Detect external tab closes ──

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      // Walk stack from the end; remove entries whose tabs disappeared
      for (let i = panelStack.length - 1; i >= 0; i--) {
        const entry = panelStack[i];
        const stillOpen = vscode.window.visibleTextEditors.some((e) => {
          if (entry.previewUri) {
            return e.document.uri.toString() === entry.previewUri;
          }
          return (
            e.viewColumn === entry.viewColumn &&
            e.document.uri.toString() === sourceDocUri
          );
        });
        if (!stillOpen) {
          // This panel and everything deeper is gone
          panelStack.splice(i);
          previewProvider.clearFrom(i);
          break;
        }
      }
    })
  );

  // ── Selection handler ──

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (
        e.kind !== vscode.TextEditorSelectionChangeKind.Mouse &&
        e.kind !== vscode.TextEditorSelectionChangeKind.Keyboard
      ) {
        return;
      }

      const { mode } = getConfig();
      if (mode !== 'side-panel' && mode !== 'preview') return;

      const doc = e.textEditor.document;
      const col = e.textEditor.viewColumn;

      // Determine depth: source = -1, panel stack index by match
      let clickDepth = -2; // -2 = unrelated editor, ignore

      if (doc.uri.toString() === sourceDocUri && col === sourceViewColumn) {
        clickDepth = -1; // source editor
      } else if (doc.uri.scheme === 'cte-peek') {
        // Preview mode: match by URI
        const d = previewProvider.depthOf(doc.uri);
        if (d >= 0 && d < panelStack.length) clickDepth = d;
      } else if (sourceDocUri && doc.uri.toString() === sourceDocUri) {
        // Side-panel mode: match by viewColumn
        const idx = panelStack.findIndex((p) => p.viewColumn === col);
        if (idx >= 0) clickDepth = idx;
      }

      // If no panels open yet, accept any supported SQL file as source
      if (panelStack.length === 0 && supportedLanguages.includes(doc.languageId)) {
        clickDepth = -1;
      }

      if (clickDepth === -2) return; // unrelated editor

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleSelection(e.textEditor, doc, clickDepth, mode);
      }, 100);
    })
  );

  // ── Close panels from a given depth onward ──

  async function closePanelsFrom(depth: number): Promise<void> {
    // Close tabs in reverse order (deepest first)
    for (let i = panelStack.length - 1; i >= depth; i--) {
      const entry = panelStack[i];
      const targetUri = entry.previewUri ?? sourceDocUri;
      for (const tabGroup of vscode.window.tabGroups.all) {
        if (tabGroup.viewColumn !== entry.viewColumn) continue;
        for (const tab of tabGroup.tabs) {
          if (
            tab.input instanceof vscode.TabInputText &&
            tab.input.uri.toString() === targetUri
          ) {
            await vscode.window.tabGroups.close(tab);
          }
        }
      }
    }
    panelStack.splice(depth);
    previewProvider.clearFrom(depth);
    if (depth === 0) sourceDocUri = '';
  }

  // ── Main handler ──

  async function handleSelection(
    editor: vscode.TextEditor,
    doc: vscode.TextDocument,
    clickDepth: number,
    mode: string
  ): Promise<void> {
    const { maxDepth } = getConfig();
    const position = editor.selection.active;
    const wordRange = doc.getWordRangeAtPosition(
      position,
      /[a-zA-Z_][a-zA-Z0-9_]*/
    );

    // Resolve CTE from the SOURCE document's parse result
    let parseResult: CteParseResult;
    if (sourceDocUri && clickDepth >= 0) {
      // Click is in a panel — look up CTEs from the source document
      const sourceEditors = vscode.window.visibleTextEditors.filter(
        (e) => e.document.uri.toString() === sourceDocUri
      );
      if (sourceEditors.length === 0) {
        await closePanelsFrom(0);
        return;
      }
      parseResult = getCachedCtes(sourceEditors[0].document);
    } else {
      parseResult = getCachedCtes(doc);
    }

    if (!wordRange) {
      // No word under cursor — close from this depth
      if (clickDepth === -1) {
        await closePanelsFrom(0);
      } else {
        await closePanelsFrom(clickDepth);
      }
      return;
    }

    const word = doc.getText(wordRange);
    const cte = parseResult.ctes.get(word.toLowerCase());

    if (!cte) {
      if (clickDepth === -1) {
        await closePanelsFrom(0);
      } else {
        await closePanelsFrom(clickDepth);
      }
      return;
    }

    // Skip if clicking the CTE definition itself (only relevant for source)
    if (clickDepth === -1) {
      const defPos = doc.positionAt(cte.nameOffset);
      if (
        defPos.line === wordRange.start.line &&
        defPos.character === wordRange.start.character
      ) {
        await closePanelsFrom(0);
        return;
      }
    }

    // Target depth for the new panel
    const targetDepth = clickDepth + 1;

    // Enforce max nesting
    if (targetDepth >= maxDepth) return;

    // If same CTE already at target depth, nothing to do
    if (
      targetDepth < panelStack.length &&
      panelStack[targetDepth].cteName === cte.nameLower
    ) {
      // But close anything deeper that might be stale
      if (targetDepth + 1 < panelStack.length) {
        await closePanelsFrom(targetDepth + 1);
      }
      return;
    }

    // Close panels from targetDepth onward (replacing)
    if (targetDepth < panelStack.length) {
      await closePanelsFrom(targetDepth);
    }

    // Record source document on first open
    if (clickDepth === -1) {
      sourceDocUri = doc.uri.toString();
      sourceViewColumn = editor.viewColumn;
    }

    // Open the new panel
    if (mode === 'side-panel') {
      await openSidePanel(targetDepth, cte);
    } else {
      await openPreview(targetDepth, cte);
    }
  }

  // ── Open helpers ──

  async function openSidePanel(
    depth: number,
    cte: { nameLower: string; nameOffset: number; bodyEndOffset: number }
  ): Promise<void> {
    // Open beside the rightmost existing panel (or source)
    const sourceDoc = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === sourceDocUri
    )?.document;
    if (!sourceDoc) return;

    const sideEditor = await vscode.window.showTextDocument(sourceDoc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });

    panelStack[depth] = {
      viewColumn: sideEditor.viewColumn!,
      cteName: cte.nameLower,
    };

    const cteStart = sourceDoc.positionAt(cte.nameOffset);
    const cteEnd = sourceDoc.positionAt(cte.bodyEndOffset + 1);
    sideEditor.revealRange(
      new vscode.Range(cteStart, cteEnd),
      vscode.TextEditorRevealType.InCenter
    );
  }

  async function openPreview(
    depth: number,
    cte: { name: string; nameLower: string; body: string }
  ): Promise<void> {
    previewProvider.updateAt(depth, cte.name, cte.body);
    const uri = previewProvider.getUri(depth);

    await previewProvider.ensureLanguage(uri);
    const previewEditor = await vscode.window.showTextDocument(uri, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });

    panelStack[depth] = {
      viewColumn: previewEditor.viewColumn!,
      cteName: cte.nameLower,
      previewUri: uri.toString(),
    };
  }
}
