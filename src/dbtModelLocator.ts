import * as vscode from 'vscode';

const cache = new Map<string, vscode.Uri | null>();
let watcher: vscode.FileSystemWatcher | undefined;

export function setupDbtModelWatcher(context: vscode.ExtensionContext): void {
  if (watcher) return;
  watcher = vscode.workspace.createFileSystemWatcher('**/*.sql');
  const invalidate = (uri: vscode.Uri) => {
    const base = baseName(uri);
    if (base) cache.delete(base);
  };
  watcher.onDidCreate(invalidate);
  watcher.onDidDelete(invalidate);
  watcher.onDidChange(invalidate);
  context.subscriptions.push(watcher);
}

function baseName(uri: vscode.Uri): string | null {
  const path = uri.path;
  const slash = path.lastIndexOf('/');
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : null;
}

export async function locateDbtModel(name: string): Promise<vscode.Uri | null> {
  if (cache.has(name)) return cache.get(name) ?? null;

  const matches = await vscode.workspace.findFiles(
    `**/${name}.sql`,
    '**/target/**',
    2
  );

  const result = matches[0] ?? null;
  cache.set(name, result);
  return result;
}

export function clearDbtModelCache(): void {
  cache.clear();
}
