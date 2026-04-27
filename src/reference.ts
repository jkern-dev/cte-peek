import * as vscode from 'vscode';
import { getCachedCtes } from './cteCache';
import { CteDefinition } from './cteParser';
import { findDbtRefAt } from './dbtRefParser';
import { locateDbtModel } from './dbtModelLocator';

export type TriggerMode = 'cte' | 'dbt' | 'both';

export type Reference =
  | {
      kind: 'cte';
      name: string;
      nameLower: string;
      range: vscode.Range;
      cte: CteDefinition;
    }
  | {
      kind: 'dbt';
      name: string;
      nameLower: string;
      range: vscode.Range;
      targetUri: vscode.Uri;
    };

export function getTriggerMode(): TriggerMode {
  return vscode.workspace
    .getConfiguration('sqlCtePeek')
    .get<TriggerMode>('triggerMode', 'both');
}

/**
 * Resolve the reference under `position` in `document`. Honors triggerMode.
 * CTE resolution is preferred when both modes are enabled and a CTE matches —
 * a CTE alias is unambiguously local; a dbt ref name could collide with one.
 */
export async function resolveReferenceAt(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<Reference | null> {
  const mode = getTriggerMode();

  if (mode === 'cte' || mode === 'both') {
    const cteRef = resolveCteAt(document, position);
    if (cteRef) return cteRef;
  }

  if (mode === 'dbt' || mode === 'both') {
    const dbtRef = await resolveDbtAt(document, position);
    if (dbtRef) return dbtRef;
  }

  return null;
}

function resolveCteAt(
  document: vscode.TextDocument,
  position: vscode.Position
): Reference | null {
  const wordRange = document.getWordRangeAtPosition(
    position,
    /[a-zA-Z_][a-zA-Z0-9_]*/
  );
  if (!wordRange) return null;
  const word = document.getText(wordRange);
  const parseResult = getCachedCtes(document);
  const cte = parseResult.ctes.get(word.toLowerCase());
  if (!cte) return null;
  return {
    kind: 'cte',
    name: cte.name,
    nameLower: cte.nameLower,
    range: wordRange,
    cte,
  };
}

async function resolveDbtAt(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<Reference | null> {
  const offset = document.offsetAt(position);
  const match = findDbtRefAt(document.getText(), offset);
  if (!match) return null;

  const targetUri = await locateDbtModel(match.name);
  if (!targetUri) return null;

  const range = new vscode.Range(
    document.positionAt(match.nameStart),
    document.positionAt(match.nameEnd)
  );

  return {
    kind: 'dbt',
    name: match.name,
    nameLower: match.name.toLowerCase(),
    range,
    targetUri,
  };
}

/** Synchronous variant — used by hover where we already know the cursor word
 *  and don't want to re-find. Falls back to returning a CTE-only result. */
export function resolveReferenceSyncCte(
  document: vscode.TextDocument,
  position: vscode.Position
): Reference | null {
  return resolveCteAt(document, position);
}

/** Identity key for de-duping panel entries across CTE and dbt refs. */
export function referenceKey(ref: Reference): string {
  return ref.kind === 'cte'
    ? `cte:${ref.nameLower}`
    : `dbt:${ref.targetUri.toString()}`;
}
