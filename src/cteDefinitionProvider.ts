import * as vscode from 'vscode';
import { resolveReferenceAt } from './reference';

export class CteDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Location | null> {
    const ref = await resolveReferenceAt(document, position);
    if (!ref) return null;

    if (ref.kind === 'cte') {
      const defPosition = document.positionAt(ref.cte.nameOffset);
      return new vscode.Location(document.uri, defPosition);
    }

    return new vscode.Location(ref.targetUri, new vscode.Position(0, 0));
  }
}
