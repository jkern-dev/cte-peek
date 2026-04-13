import * as vscode from 'vscode';
import { getCachedCtes } from './cteCache';

export class CteHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | null {
    const mode = vscode.workspace.getConfiguration('sqlCtePeek').get<string>('displayMode', 'side-panel');
    if (mode !== 'hover') return null;

    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    const parseResult = getCachedCtes(document);
    const cte = parseResult.ctes.get(word.toLowerCase());
    if (!cte) return null;

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
