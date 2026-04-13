import * as vscode from 'vscode';
import { getCachedCtes } from './cteCache';

const PREVIEW_URI = vscode.Uri.parse('cte-peek:/CTE Preview.sql');

/**
 * Read-only virtual document provider for "preview" mode.
 */
export class CtePreviewProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private content = '';
  private currentCte = '';

  get uri(): vscode.Uri {
    return PREVIEW_URI;
  }

  update(name: string, body: string): boolean {
    const key = name.toLowerCase();
    if (key === this.currentCte) return false;
    this.currentCte = key;
    this.content = `-- CTE: ${name}\n\n${body}\n`;
    this._onDidChange.fire(PREVIEW_URI);
    return true;
  }

  clear(): void {
    this.currentCte = '';
    this.content = '';
  }

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.content;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

function getDisplayMode(): string {
  return vscode.workspace
    .getConfiguration('sqlCtePeek')
    .get<string>('displayMode', 'side-panel');
}

export function setupSelectionListener(
  context: vscode.ExtensionContext,
  previewProvider: CtePreviewProvider,
  supportedLanguages: string[]
): void {
  // -- Shared state --
  let sourceDocUri = '';
  let currentCteName = '';
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // -- Side-panel (editable) state --
  let sideViewColumn: vscode.ViewColumn | undefined;

  // -- Preview (read-only) state --
  let previewVisible = false;
  let previewLanguageSet = false;

  // Track external close of side-panel or preview tab
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      if (sideViewColumn) {
        const still = editors.some(
          (e) =>
            e.viewColumn === sideViewColumn &&
            e.document.uri.toString() === sourceDocUri
        );
        if (!still) {
          sideViewColumn = undefined;
          currentCteName = '';
        }
      }
      if (previewVisible) {
        previewVisible = editors.some(
          (e) => e.document.uri.toString() === previewProvider.uri.toString()
        );
        if (!previewVisible) currentCteName = '';
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (
        e.kind !== vscode.TextEditorSelectionChangeKind.Mouse &&
        e.kind !== vscode.TextEditorSelectionChangeKind.Keyboard
      ) {
        return;
      }

      const mode = getDisplayMode();
      if (mode !== 'side-panel' && mode !== 'preview') return;

      const doc = e.textEditor.document;

      // Ignore clicks inside the side/preview editor
      if (doc.uri.scheme === 'cte-peek') return;
      if (sideViewColumn && e.textEditor.viewColumn === sideViewColumn) return;

      // Only react to the source document that initiated the panel
      const panelOpen = sideViewColumn || previewVisible;
      if (panelOpen && doc.uri.toString() !== sourceDocUri) return;
      if (!supportedLanguages.includes(doc.languageId)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleSelection(e.textEditor, doc, mode);
      }, 100);
    })
  );

  // -- Close helpers --

  async function closeSidePanel(): Promise<void> {
    if (!sideViewColumn) return;
    for (const tabGroup of vscode.window.tabGroups.all) {
      if (tabGroup.viewColumn !== sideViewColumn) continue;
      for (const tab of tabGroup.tabs) {
        if (
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === sourceDocUri
        ) {
          await vscode.window.tabGroups.close(tab);
          sideViewColumn = undefined;
          currentCteName = '';
          sourceDocUri = '';
          return;
        }
      }
    }
  }

  async function closePreview(): Promise<void> {
    if (!previewVisible) return;
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === previewProvider.uri.toString()
        ) {
          await vscode.window.tabGroups.close(tab);
          previewProvider.clear();
          previewVisible = false;
          currentCteName = '';
          sourceDocUri = '';
          return;
        }
      }
    }
  }

  async function closeAny(): Promise<void> {
    await closeSidePanel();
    await closePreview();
  }

  // -- Main handler --

  async function handleSelection(
    editor: vscode.TextEditor,
    doc: vscode.TextDocument,
    mode: string
  ): Promise<void> {
    const position = editor.selection.active;
    const wordRange = doc.getWordRangeAtPosition(
      position,
      /[a-zA-Z_][a-zA-Z0-9_]*/
    );

    if (!wordRange) {
      await closeAny();
      return;
    }

    const word = doc.getText(wordRange);
    const parseResult = getCachedCtes(doc);
    const cte = parseResult.ctes.get(word.toLowerCase());

    if (!cte) {
      await closeAny();
      return;
    }

    // On the CTE definition itself — close
    const defPos = doc.positionAt(cte.nameOffset);
    if (
      defPos.line === wordRange.start.line &&
      defPos.character === wordRange.start.character
    ) {
      await closeAny();
      return;
    }

    sourceDocUri = doc.uri.toString();

    if (mode === 'side-panel') {
      // Close preview if it was open from a previous mode switch
      await closePreview();
      await showSidePanel(doc, cte);
    } else {
      // Close side-panel if it was open from a previous mode switch
      await closeSidePanel();
      await showPreview(cte);
    }
  }

  async function showSidePanel(
    doc: vscode.TextDocument,
    cte: { nameLower: string; nameOffset: number; bodyEndOffset: number }
  ): Promise<void> {
    if (cte.nameLower === currentCteName && sideViewColumn) return;
    currentCteName = cte.nameLower;

    const sideEditor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });
    sideViewColumn = sideEditor.viewColumn;

    const cteStart = doc.positionAt(cte.nameOffset);
    const cteEnd = doc.positionAt(cte.bodyEndOffset + 1);
    sideEditor.revealRange(
      new vscode.Range(cteStart, cteEnd),
      vscode.TextEditorRevealType.InCenter
    );
  }

  async function showPreview(
    cte: { name: string; nameLower: string; body: string }
  ): Promise<void> {
    const changed = previewProvider.update(cte.name, cte.body);
    if (!changed && previewVisible) return;
    currentCteName = cte.nameLower;

    if (!previewVisible) {
      const sideDoc = await vscode.workspace.openTextDocument(previewProvider.uri);
      if (!previewLanguageSet) {
        await vscode.languages.setTextDocumentLanguage(sideDoc, 'sql');
        previewLanguageSet = true;
      }
      await vscode.window.showTextDocument(sideDoc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
        preview: true,
      });
      previewVisible = true;
    }
  }
}
