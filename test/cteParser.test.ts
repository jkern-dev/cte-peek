import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCtes } from '../src/cteParser';

function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
}

describe('parseCtes', () => {
  it('returns empty result for plain SELECT', () => {
    const result = parseCtes('SELECT 1');
    assert.equal(result.cteList.length, 0);
    assert.equal(result.ctes.size, 0);
  });

  it('parses a single CTE', () => {
    const sql = fixture('simple.sql');
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 1);
    const cte = result.ctes.get('active_users');
    assert.ok(cte, 'CTE "active_users" should exist');
    assert.equal(cte.name, 'active_users');
    assert.ok(cte.body.includes('SELECT id, name, email'));
    assert.ok(cte.body.includes('WHERE active = true'));
  });

  it('parses multiple CTEs', () => {
    const sql = fixture('multiple-ctes.sql');
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 3);
    assert.ok(result.ctes.has('orders'));
    assert.ok(result.ctes.has('customers'));
    assert.ok(result.ctes.has('enriched'));

    const enriched = result.ctes.get('enriched')!;
    assert.ok(enriched.body.includes('FROM orders o'));
    assert.ok(enriched.body.includes('JOIN customers c'));
  });

  it('handles nested parentheses', () => {
    const sql = fixture('nested-parens.sql');
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 1);
    const cte = result.ctes.get('filtered')!;
    assert.ok(cte.body.includes('ROW_NUMBER()'));
    assert.ok(cte.body.includes('IN (SELECT user_id FROM active_sessions)'));
    assert.ok(cte.body.includes('WHERE sub.rn = 1'));
  });

  it('handles string literals with parentheses and escaped quotes', () => {
    const sql = fixture('string-literals.sql');
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 1);
    const cte = result.ctes.get('escaped')!;
    assert.ok(cte.body.includes("'it''s a (test)'"));
    assert.ok(cte.body.includes("'%(foo)%'"));
  });

  it('handles single-line and block comments with parentheses', () => {
    const sql = fixture('comments.sql');
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 2);
    assert.ok(result.ctes.has('active'));
    assert.ok(result.ctes.has('recent'));

    const active = result.ctes.get('active')!;
    assert.ok(active.body.includes('-- WHERE active = true (old filter)'));

    const recent = result.ctes.get('recent')!;
    assert.ok(recent.body.includes('/* user id (pk) */'));
  });

  it('handles dbt Jinja templates', () => {
    const sql = fixture('dbt-jinja.sql');
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 2);
    assert.ok(result.ctes.has('source'));
    assert.ok(result.ctes.has('filtered'));

    const source = result.ctes.get('source')!;
    assert.ok(source.body.includes("{{ ref('stg_appointments') }}"));

    const filtered = result.ctes.get('filtered')!;
    assert.ok(filtered.body.includes('{{ dbt_utils.star('));
  });

  it('is case-insensitive for keywords', () => {
    const sql = `with MyAlias as (select 1) SELECT * FROM MyAlias`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 1);
    // Lookup by lowercase
    assert.ok(result.ctes.has('myalias'));
    // But preserves original case
    assert.equal(result.ctes.get('myalias')!.name, 'MyAlias');
  });

  it('handles WITH RECURSIVE', () => {
    const sql = `WITH RECURSIVE tree AS (
      SELECT id, parent_id, name FROM nodes WHERE parent_id IS NULL
      UNION ALL
      SELECT n.id, n.parent_id, n.name FROM nodes n JOIN tree t ON n.parent_id = t.id
    )
    SELECT * FROM tree`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 1);
    const cte = result.ctes.get('tree')!;
    assert.ok(cte.body.includes('UNION ALL'));
  });

  it('handles double-quoted identifiers', () => {
    const sql = `WITH "My CTE" AS (SELECT 1 AS val) SELECT * FROM "My CTE"`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 1);
    assert.ok(result.ctes.has('my cte'));
    assert.equal(result.ctes.get('my cte')!.name, 'My CTE');
  });

  it('tracks correct line numbers', () => {
    const sql = `SELECT 1;
WITH
    first_cte AS (
        SELECT id
        FROM users
    ),
    second_cte AS (
        SELECT id
        FROM orders
    )
SELECT * FROM first_cte JOIN second_cte`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 2);

    const first = result.ctes.get('first_cte')!;
    assert.equal(first.startLine, 2); // 0-indexed: line "    first_cte AS ("

    const second = result.ctes.get('second_cte')!;
    assert.equal(second.startLine, 6); // 0-indexed: line "    second_cte AS ("
  });

  it('handles inline CTE (single line)', () => {
    const sql = `WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 2);
    assert.equal(result.ctes.get('a')!.body, 'SELECT 1');
    assert.equal(result.ctes.get('b')!.body, 'SELECT 2');
  });

  it('returns empty for WITH in a comment', () => {
    const sql = `-- WITH fake AS (SELECT 1)
SELECT 1`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 0);
  });

  it('returns empty for WITH inside a string', () => {
    const sql = `SELECT 'WITH fake AS (SELECT 1)' AS val`;
    const result = parseCtes(sql);
    assert.equal(result.cteList.length, 0);
  });
});
