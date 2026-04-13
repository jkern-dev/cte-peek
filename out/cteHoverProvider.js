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
exports.CteHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const cteCache_1 = require("./cteCache");
class CteHoverProvider {
    provideHover(document, position, _token) {
        const mode = vscode.workspace.getConfiguration('sqlCtePeek').get('displayMode', 'side-panel');
        if (mode !== 'hover')
            return null;
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!wordRange)
            return null;
        const word = document.getText(wordRange);
        const parseResult = (0, cteCache_1.getCachedCtes)(document);
        const cte = parseResult.ctes.get(word.toLowerCase());
        if (!cte)
            return null;
        // Don't show hover on the CTE definition itself
        const defPos = document.positionAt(cte.nameOffset);
        if (defPos.line === wordRange.start.line && defPos.character === wordRange.start.character) {
            return null;
        }
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**CTE:** \`${cte.name}\`\n\n`);
        markdown.appendCodeblock(cte.body, 'sql');
        markdown.isTrusted = true;
        return new vscode.Hover(markdown, wordRange);
    }
}
exports.CteHoverProvider = CteHoverProvider;
//# sourceMappingURL=cteHoverProvider.js.map