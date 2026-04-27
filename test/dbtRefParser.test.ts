import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findDbtRefAt } from '../src/dbtRefParser';

function offsetOf(text: string, marker: string): number {
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error(`marker not found: ${marker}`);
  return idx;
}

describe('findDbtRefAt', () => {
  it('matches single-arg ref with cursor on the name', () => {
    const text = `select * from {{ ref('base_headway__group_practices') }}`;
    const offset = offsetOf(text, 'base_headway') + 5;
    const m = findDbtRefAt(text, offset);
    assert.ok(m);
    assert.equal(m!.name, 'base_headway__group_practices');
    assert.equal(text.slice(m!.nameStart, m!.nameEnd), 'base_headway__group_practices');
  });

  it('matches double-quoted ref', () => {
    const text = `select * from {{ ref("dim_users") }}`;
    const offset = offsetOf(text, 'dim_users') + 2;
    const m = findDbtRefAt(text, offset);
    assert.ok(m);
    assert.equal(m!.name, 'dim_users');
  });

  it('matches two-arg ref on the model-name (second arg)', () => {
    const text = `{{ ref('my_pkg', 'fct_orders') }}`;
    const offset = offsetOf(text, 'fct_orders') + 3;
    const m = findDbtRefAt(text, offset);
    assert.ok(m);
    assert.equal(m!.name, 'fct_orders');
  });

  it('does not match cursor on the package arg', () => {
    const text = `{{ ref('my_pkg', 'fct_orders') }}`;
    const offset = offsetOf(text, 'my_pkg') + 2;
    const m = findDbtRefAt(text, offset);
    assert.equal(m, null);
  });

  it('does not match cursor on the ref keyword', () => {
    const text = `select * from {{ ref('foo') }}`;
    const offset = offsetOf(text, 'ref') + 1;
    const m = findDbtRefAt(text, offset);
    assert.equal(m, null);
  });

  it('does not match cursor outside the quoted name', () => {
    const text = `select * from {{ ref('foo') }} order by 1`;
    const outside = offsetOf(text, 'order') + 1;
    assert.equal(findDbtRefAt(text, outside), null);
  });

  it('handles whitespace-trim {{- ... -}}', () => {
    const text = `{{- ref('staging_orders') -}}`;
    const offset = offsetOf(text, 'staging') + 3;
    const m = findDbtRefAt(text, offset);
    assert.ok(m);
    assert.equal(m!.name, 'staging_orders');
  });

  it('handles version kwarg: ref(name, v=2)', () => {
    const text = `{{ ref('snapshot_x', v=2) }}`;
    const offset = offsetOf(text, 'snapshot_x') + 4;
    const m = findDbtRefAt(text, offset);
    assert.ok(m);
    assert.equal(m!.name, 'snapshot_x');
  });

  it('returns null on malformed ref', () => {
    const text = `{{ ref('unclosed `;
    assert.equal(findDbtRefAt(text, 8), null);
  });

  it('returns null on plain SQL with no jinja', () => {
    const text = `select * from foo where id = 1`;
    assert.equal(findDbtRefAt(text, 5), null);
  });

  it('matches when surrounded by other content (window-bounded scan)', () => {
    const lead = 'select id,\n  name,\n  email\nfrom ';
    const text = lead + `{{ ref('users') }}` + ` where active = true`;
    const offset = lead.length + `{{ ref('`.length + 2;
    const m = findDbtRefAt(text, offset);
    assert.ok(m);
    assert.equal(m!.name, 'users');
  });
});
