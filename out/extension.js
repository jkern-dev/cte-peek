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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cteHoverProvider_1 = require("./cteHoverProvider");
const cteDefinitionProvider_1 = require("./cteDefinitionProvider");
const cteSidePanel_1 = require("./cteSidePanel");
const cteCache_1 = require("./cteCache");
const dbtModelLocator_1 = require("./dbtModelLocator");
const SUPPORTED_LANGUAGES = ['sql', 'snowflake-sql', 'sql-mssql', 'jinja-sql'];
function activate(context) {
    // Read-only preview provider (for "preview" mode)
    const previewProvider = new cteSidePanel_1.CtePreviewProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('cte-peek', previewProvider));
    context.subscriptions.push(previewProvider);
    (0, dbtModelLocator_1.setupDbtModelWatcher)(context);
    // Selection listener handles both "preview" and "side-panel" modes
    (0, cteSidePanel_1.setupSelectionListener)(context, previewProvider, SUPPORTED_LANGUAGES);
    // Hover (for "hover" mode) + Go-to-definition (always active)
    for (const language of SUPPORTED_LANGUAGES) {
        context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, new cteHoverProvider_1.CteHoverProvider()));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language }, new cteDefinitionProvider_1.CteDefinitionProvider()));
    }
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => {
        (0, cteCache_1.clearCache)(doc.uri);
    }));
}
function deactivate() {
    (0, cteCache_1.disposeCache)();
    (0, dbtModelLocator_1.clearDbtModelCache)();
}
//# sourceMappingURL=extension.js.map