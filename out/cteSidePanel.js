"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CtePreviewProvider = void 0;
exports.setupSelectionListener = setupSelectionListener;
const vscode = __importStar(require("vscode"));
const cteCache_1 = require("./cteCache");
const PREVIEW_URI = vscode.Uri.parse('cte-peek:/CTE Preview.sql');
/**
 * Read-only virtual document provider for "preview" mode.
 */
class CtePreviewProvider {
    _onDidChange = new vscode.EventEmitter();
    onDidChange = this._onDidChange.event;
    content = '';
    currentCte = '';
    get uri() {
        return PREVIEW_URI;
    }
    update(name, body) {
        const key = name.toLowerCase();
        if (key === this.currentCte)
            return false;
        this.currentCte = key;
        this.content = `-- CTE: ${name}\n\n${body}\n`;
        this._onDidChange.fire(PREVIEW_URI);
        return true;
    }
    clear() {
        this.currentCte = '';
        this.content = '';
    }
    provideTextDocumentContent(_uri) {
        return this.content;
    }
    dispose() {
        this._onDidChange.dispose();
    }
}
exports.CtePreviewProvider = CtePreviewProvider;
function getDisplayMode() {
    return vscode.workspace
        .getConfiguration('sqlCtePeek')
        .get('displayMode', 'side-panel');
}
function setupSelectionListener(context, previewProvider, supportedLanguages) {
    // -- Shared state --
    let sourceDocUri = '';
    let currentCteName = '';
    let debounceTimer;
    // -- Side-panel (editable) state --
    let sideViewColumn;
    // -- Preview (read-only) state --
    let previewVisible = false;
    let previewLanguageSet = false;
    // Track external close of side-panel or preview tab
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors((editors) => {
        if (sideViewColumn) {
            const still = editors.some((e) => e.viewColumn === sideViewColumn &&
                e.document.uri.toString() === sourceDocUri);
            if (!still) {
                sideViewColumn = undefined;
                currentCteName = '';
            }
        }
        if (previewVisible) {
            previewVisible = editors.some((e) => e.document.uri.toString() === previewProvider.uri.toString());
            if (!previewVisible)
                currentCteName = '';
        }
    }));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse &&
            e.kind !== vscode.TextEditorSelectionChangeKind.Keyboard) {
            return;
        }
        const mode = getDisplayMode();
        if (mode !== 'side-panel' && mode !== 'preview')
            return;
        const doc = e.textEditor.document;
        // Ignore clicks inside the side/preview editor
        if (doc.uri.scheme === 'cte-peek')
            return;
        if (sideViewColumn && e.textEditor.viewColumn === sideViewColumn)
            return;
        // Only react to the source document that initiated the panel
        const panelOpen = sideViewColumn || previewVisible;
        if (panelOpen && doc.uri.toString() !== sourceDocUri)
            return;
        if (!supportedLanguages.includes(doc.languageId))
            return;
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleSelection(e.textEditor, doc, mode);
        }, 100);
    }));
    // -- Close helpers --
    async function closeSidePanel() {
        if (!sideViewColumn)
            return;
        for (const tabGroup of vscode.window.tabGroups.all) {
            if (tabGroup.viewColumn !== sideViewColumn)
                continue;
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText &&
                    tab.input.uri.toString() === sourceDocUri) {
                    await vscode.window.tabGroups.close(tab);
                    sideViewColumn = undefined;
                    currentCteName = '';
                    sourceDocUri = '';
                    return;
                }
            }
        }
    }
    async function closePreview() {
        if (!previewVisible)
            return;
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText &&
                    tab.input.uri.toString() === previewProvider.uri.toString()) {
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
    async function closeAny() {
        await closeSidePanel();
        await closePreview();
    }
    // -- Main handler --
    async function handleSelection(editor, doc, mode) {
        const position = editor.selection.active;
        const wordRange = doc.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!wordRange) {
            await closeAny();
            return;
        }
        const word = doc.getText(wordRange);
        const parseResult = (0, cteCache_1.getCachedCtes)(doc);
        const cte = parseResult.ctes.get(word.toLowerCase());
        if (!cte) {
            await closeAny();
            return;
        }
        // On the CTE definition itself — close
        const defPos = doc.positionAt(cte.nameOffset);
        if (defPos.line === wordRange.start.line &&
            defPos.character === wordRange.start.character) {
            await closeAny();
            return;
        }
        sourceDocUri = doc.uri.toString();
        if (mode === 'side-panel') {
            // Close preview if it was open from a previous mode switch
            await closePreview();
            await showSidePanel(doc, cte);
        }
        else {
            // Close side-panel if it was open from a previous mode switch
            await closeSidePanel();
            await showPreview(cte);
        }
    }
    async function showSidePanel(doc, cte) {
        if (cte.nameLower === currentCteName && sideViewColumn)
            return;
        currentCteName = cte.nameLower;
        const sideEditor = await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
            preview: true,
        });
        sideViewColumn = sideEditor.viewColumn;
        const cteStart = doc.positionAt(cte.nameOffset);
        const cteEnd = doc.positionAt(cte.bodyEndOffset + 1);
        sideEditor.revealRange(new vscode.Range(cteStart, cteEnd), vscode.TextEditorRevealType.InCenter);
    }
    async function showPreview(cte) {
        const changed = previewProvider.update(cte.name, cte.body);
        if (!changed && previewVisible)
            return;
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
//# sourceMappingURL=cteSidePanel.js.map