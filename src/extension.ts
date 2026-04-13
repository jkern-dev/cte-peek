import * as vscode from 'vscode';
import { CteHoverProvider } from './cteHoverProvider';
import { CteDefinitionProvider } from './cteDefinitionProvider';
import { CtePreviewProvider, setupSelectionListener } from './cteSidePanel';
import { clearCache, disposeCache } from './cteCache';

const SUPPORTED_LANGUAGES = ['sql', 'snowflake-sql'];

export function activate(context: vscode.ExtensionContext): void {
  // Read-only preview provider (for "preview" mode)
  const previewProvider = new CtePreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('cte-peek', previewProvider)
  );
  context.subscriptions.push(previewProvider);

  // Selection listener handles both "preview" and "side-panel" modes
  setupSelectionListener(context, previewProvider, SUPPORTED_LANGUAGES);

  // Hover (for "hover" mode) + Go-to-definition (always active)
  for (const language of SUPPORTED_LANGUAGES) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider({ language }, new CteHoverProvider())
    );
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider({ language }, new CteDefinitionProvider())
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearCache(doc.uri);
    })
  );
}

export function deactivate(): void {
  disposeCache();
}
