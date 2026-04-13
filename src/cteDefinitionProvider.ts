import * as vscode from 'vscode';
import { getCachedCtes } from './cteCache';

export class CteDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Location | null {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    const parseResult = getCachedCtes(document);
    const cte = parseResult.ctes.get(word.toLowerCase());
    if (!cte) return null;

    const defPosition = document.positionAt(cte.nameOffset);
    return new vscode.Location(document.uri, defPosition);
  }
}
