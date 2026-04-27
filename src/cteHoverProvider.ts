import * as vscode from 'vscode';
import { resolveReferenceAt } from './reference';

export class CteHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const mode = vscode.workspace
      .getConfiguration('sqlCtePeek')
      .get<string>('displayMode', 'side-panel');
    if (mode !== 'hover') return null;

    const ref = await resolveReferenceAt(document, position);
    if (!ref) return null;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = false;

    if (ref.kind === 'cte') {
      const defPos = document.positionAt(ref.cte.nameOffset);
      if (
        defPos.line === ref.range.start.line &&
        defPos.character === ref.range.start.character
      ) {
        return null;
      }
      md.appendMarkdown(`**CTE:** \`${ref.name}\`\n\n`);
      md.appendCodeblock(ref.cte.body, 'sql');
      return new vscode.Hover(md, ref.range);
    }

    const lineLimit = vscode.workspace
      .getConfiguration('sqlCtePeek')
      .get<number>('hoverPreviewLines', 50);

    let snippet = '';
    let truncated = false;
    try {
      const bytes = await vscode.workspace.fs.readFile(ref.targetUri);
      const text = Buffer.from(bytes).toString('utf8');
      const lines = text.split(/\r?\n/);
      truncated = lines.length > lineLimit;
      snippet = lines.slice(0, lineLimit).join('\n');
    } catch {
      return null;
    }

    const openArgs = encodeURIComponent(JSON.stringify([ref.targetUri.toString()]));
    md.appendMarkdown(
      `**dbt model:** \`${ref.name}\` — [open file](command:vscode.open?${openArgs})\n\n`
    );
    md.appendCodeblock(snippet, 'sql');
    if (truncated) {
      md.appendMarkdown(`\n_…truncated at ${lineLimit} lines_`);
    }
    return new vscode.Hover(md, ref.range);
  }
}
