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
const reference_1 = require("./reference");
class CteHoverProvider {
    async provideHover(document, position, _token) {
        const mode = vscode.workspace
            .getConfiguration('sqlCtePeek')
            .get('displayMode', 'side-panel');
        if (mode !== 'hover')
            return null;
        const ref = await (0, reference_1.resolveReferenceAt)(document, position);
        if (!ref)
            return null;
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = false;
        if (ref.kind === 'cte') {
            const defPos = document.positionAt(ref.cte.nameOffset);
            if (defPos.line === ref.range.start.line &&
                defPos.character === ref.range.start.character) {
                return null;
            }
            md.appendMarkdown(`**CTE:** \`${ref.name}\`\n\n`);
            md.appendCodeblock(ref.cte.body, 'sql');
            return new vscode.Hover(md, ref.range);
        }
        const lineLimit = vscode.workspace
            .getConfiguration('sqlCtePeek')
            .get('hoverPreviewLines', 50);
        let snippet = '';
        let truncated = false;
        try {
            const bytes = await vscode.workspace.fs.readFile(ref.targetUri);
            const text = Buffer.from(bytes).toString('utf8');
            const lines = text.split(/\r?\n/);
            truncated = lines.length > lineLimit;
            snippet = lines.slice(0, lineLimit).join('\n');
        }
        catch {
            return null;
        }
        const openArgs = encodeURIComponent(JSON.stringify([ref.targetUri.toString()]));
        md.appendMarkdown(`**dbt model:** \`${ref.name}\` — [open file](command:vscode.open?${openArgs})\n\n`);
        md.appendCodeblock(snippet, 'sql');
        if (truncated) {
            md.appendMarkdown(`\n_…truncated at ${lineLimit} lines_`);
        }
        return new vscode.Hover(md, ref.range);
    }
}
exports.CteHoverProvider = CteHoverProvider;
//# sourceMappingURL=cteHoverProvider.js.map