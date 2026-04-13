import * as vscode from 'vscode';
import { CteParseResult, parseCtes } from './cteParser';

const cache = new Map<string, { version: number; result: CteParseResult }>();

export function getCachedCtes(document: vscode.TextDocument): CteParseResult {
  const key = document.uri.toString();
  const entry = cache.get(key);
  if (entry && entry.version === document.version) {
    return entry.result;
  }
  const result = parseCtes(document.getText());
  cache.set(key, { version: document.version, result });
  return result;
}

export function clearCache(uri: vscode.Uri): void {
  cache.delete(uri.toString());
}

export function disposeCache(): void {
  cache.clear();
}
