import * as vscode from 'vscode';
import { Reference, referenceKey, resolveReferenceAt } from './reference';

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
  refKey: string;          // referenceKey() output
  documentUri: string;     // URI shown in this panel (real file or cte-peek:)
  isVirtual: boolean;      // true if cte-peek: scheme
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
      for (let i = panelStack.length - 1; i >= 0; i--) {
        const entry = panelStack[i];
        const stillOpen = vscode.window.visibleTextEditors.some(
          (e) =>
            e.viewColumn === entry.viewColumn &&
            e.document.uri.toString() === entry.documentUri
        );
        if (!stillOpen) {
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
      const uriStr = doc.uri.toString();

      let clickDepth = -2;

      if (uriStr === sourceDocUri && col === sourceViewColumn) {
        clickDepth = -1;
      } else {
        const idx = panelStack.findIndex(
          (p) => p.viewColumn === col && p.documentUri === uriStr
        );
        if (idx >= 0) clickDepth = idx;
      }

      if (
        clickDepth === -2 &&
        panelStack.length === 0 &&
        supportedLanguages.includes(doc.languageId)
      ) {
        clickDepth = -1;
      }

      if (clickDepth === -2) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void handleSelection(e.textEditor, doc, clickDepth, mode);
      }, 100);
    })
  );

  // ── Close panels from a given depth onward ──

  async function closePanelsFrom(depth: number): Promise<void> {
    for (let i = panelStack.length - 1; i >= depth; i--) {
      const entry = panelStack[i];
      for (const tabGroup of vscode.window.tabGroups.all) {
        if (tabGroup.viewColumn !== entry.viewColumn) continue;
        for (const tab of tabGroup.tabs) {
          if (
            tab.input instanceof vscode.TabInputText &&
            tab.input.uri.toString() === entry.documentUri
          ) {
            await vscode.window.tabGroups.close(tab);
          }
        }
      }
    }
    panelStack.splice(depth);
    previewProvider.clearFrom(depth);
    if (depth === 0) {
      sourceDocUri = '';
      sourceViewColumn = undefined;
    }
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

    const ref = await resolveReferenceAt(doc, position);

    if (!ref) {
      if (clickDepth === -1) {
        await closePanelsFrom(0);
      } else {
        await closePanelsFrom(clickDepth + 1);
      }
      return;
    }

    // For CTEs, skip when the cursor is sitting on the definition itself
    // (not a reference). Only meaningful when the click is in a non-virtual doc
    // — the cte-peek body never contains the definition name.
    if (ref.kind === 'cte' && doc.uri.scheme !== 'cte-peek') {
      const defPos = doc.positionAt(ref.cte.nameOffset);
      if (
        defPos.line === ref.range.start.line &&
        defPos.character === ref.range.start.character
      ) {
        if (clickDepth === -1) {
          await closePanelsFrom(0);
        } else {
          await closePanelsFrom(clickDepth + 1);
        }
        return;
      }
    }

    const targetDepth = clickDepth + 1;

    if (targetDepth >= maxDepth) return;

    const newKey = referenceKey(ref);
    if (
      targetDepth < panelStack.length &&
      panelStack[targetDepth].refKey === newKey
    ) {
      if (targetDepth + 1 < panelStack.length) {
        await closePanelsFrom(targetDepth + 1);
      }
      return;
    }

    if (targetDepth < panelStack.length) {
      await closePanelsFrom(targetDepth);
    }

    if (clickDepth === -1) {
      sourceDocUri = doc.uri.toString();
      sourceViewColumn = editor.viewColumn;
    }

    if (ref.kind === 'cte' && mode === 'preview') {
      await openCtePreview(targetDepth, ref);
    } else if (ref.kind === 'cte') {
      await openCteSidePanel(targetDepth, ref);
    } else {
      await openDbtPanel(targetDepth, ref);
    }
  }

  // ── Open helpers ──

  async function openCteSidePanel(
    depth: number,
    ref: Extract<Reference, { kind: 'cte' }>
  ): Promise<void> {
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
      refKey: referenceKey(ref),
      documentUri: sourceDoc.uri.toString(),
      isVirtual: false,
    };

    const cteStart = sourceDoc.positionAt(ref.cte.nameOffset);
    const cteEnd = sourceDoc.positionAt(ref.cte.bodyEndOffset + 1);
    sideEditor.revealRange(
      new vscode.Range(cteStart, cteEnd),
      vscode.TextEditorRevealType.InCenter
    );
  }

  async function openCtePreview(
    depth: number,
    ref: Extract<Reference, { kind: 'cte' }>
  ): Promise<void> {
    previewProvider.updateAt(depth, ref.name, ref.cte.body);
    const uri = previewProvider.getUri(depth);

    await previewProvider.ensureLanguage(uri);
    const previewEditor = await vscode.window.showTextDocument(uri, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });

    panelStack[depth] = {
      viewColumn: previewEditor.viewColumn!,
      refKey: referenceKey(ref),
      documentUri: uri.toString(),
      isVirtual: true,
    };
  }

  async function openDbtPanel(
    depth: number,
    ref: Extract<Reference, { kind: 'dbt' }>
  ): Promise<void> {
    const editor = await vscode.window.showTextDocument(ref.targetUri, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });

    panelStack[depth] = {
      viewColumn: editor.viewColumn!,
      refKey: referenceKey(ref),
      documentUri: ref.targetUri.toString(),
      isVirtual: false,
    };
  }
}
