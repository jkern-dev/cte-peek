export interface DbtRefMatch {
  name: string;
  nameStart: number;
  nameEnd: number;
}

const WINDOW = 400;

/**
 * If `offset` sits inside the model-name string of a dbt {{ ref(...) }} call,
 * return the name and its character span (exclusive of quotes). Otherwise null.
 *
 * Supports:
 *   {{ ref('name') }}
 *   {{ ref("name") }}
 *   {{ ref('pkg', 'name') }}   — only the second (name) arg triggers
 *   {{ ref('name', v=2) }}
 *   {{- ref('name') -}}
 */
export function findDbtRefAt(text: string, offset: number): DbtRefMatch | null {
  const start = Math.max(0, offset - WINDOW);
  const end = Math.min(text.length, offset + WINDOW);
  const window = text.slice(start, end);

  const re = /\{\{-?\s*ref\s*\(\s*(?:(['"])([^'"\\]*)\1\s*,\s*)?(['"])([^'"\\]*)\3(?:\s*,\s*[^)]*)?\s*\)\s*-?\}\}/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    const matchStart = start + m.index;
    const matchEnd = matchStart + m[0].length;
    if (offset < matchStart || offset > matchEnd) continue;

    const nameQuoteChar = m[3];
    const nameValue = m[4];

    const nameQuoteIdx = m[0].lastIndexOf(
      nameQuoteChar + nameValue + nameQuoteChar
    );
    if (nameQuoteIdx < 0) continue;

    const nameStart = matchStart + nameQuoteIdx + 1;
    const nameEnd = nameStart + nameValue.length;

    if (offset < nameStart || offset > nameEnd) continue;

    return { name: nameValue, nameStart, nameEnd };
  }

  return null;
}
