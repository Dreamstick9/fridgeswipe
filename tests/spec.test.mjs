import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSpec } from '../src/spec.mjs';

const load = (p) => JSON.parse(readFileSync(new URL(`../examples/${p}`, import.meta.url)));
const codes = (spec) => validateSpec(spec).errors.map((e) => e.code);

test('valid specs pass', () => {
  for (const f of ['review-loop.spec.json', 'fanout.spec.json']) {
    const r = validateSpec(load(f));
    assert.equal(r.ok, true, `${f}: ${JSON.stringify(r.errors, null, 2)}`);
  }
});

test('the broken fixture trips every intended validator', () => {
  const got = new Set(codes(load('broken.spec.json')));
  for (const c of ['E_RESERVED_ID', 'E_UNDECLARED_READ', 'E_VERIFIER_WRITES_ARTIFACT',
                   'E_VERIFIER_READS_NOTHING', 'E_COND_PARSE', 'E_EDGE_TO', 'E_ENTRY',
                   'E_CAP_STEPS', 'E_CAP_SPEND', 'E_UNBOUNDED_CYCLE']) {
    assert.ok(got.has(c), `expected ${c}; got ${[...got].join(', ')}`);
  }
});

test('a cycle needs exactly one loop-back, not one per edge', () => {
  const s = load('review-loop.spec.json');
  assert.ok(!codes(s).includes('E_UNBOUNDED_CYCLE'), 'flagged loop-back must satisfy the cycle rule');
  const stripped = { ...s, edges: s.edges.map((e) => ({ ...e, loopBack: false })) };
  assert.ok(codes(stripped).includes('E_UNBOUNDED_CYCLE'), 'removing the flag must be caught');
});

test('a loop-back without a positive cap is rejected', () => {
  const s = load('review-loop.spec.json');
  const uncapped = { ...s, caps: { ...s.caps, maxLoopBacks: {} } };
  assert.ok(codes(uncapped).includes('E_UNBOUNDED_LOOP'));
});

test('unreachable nodes and dead ends are caught', () => {
  const s = load('review-loop.spec.json');
  const orphaned = { ...s, nodes: [...s.nodes, { id: 'ghost', kind: 'produce', role: 'x', reads: [], writes: [] }] };
  assert.ok(codes(orphaned).includes('E_UNREACHABLE'));
  const deadEnd = { ...s, edges: s.edges.filter((e) => e.to !== 'END') };
  assert.ok(codes(deadEnd).includes('E_NO_PATH_TO_END'));
});

test('a spec with no verifier is rejected', () => {
  const s = load('review-loop.spec.json');
  const noVerify = { ...s, nodes: s.nodes.map((n) => (n.kind === 'verify' ? { ...n, kind: 'produce' } : n)) };
  assert.ok(codes(noVerify).includes('E_NO_VERIFIER'));
});

test('validation never throws, whatever it is handed', () => {
  for (const junk of [null, 42, 'x', [], {}, { nodes: 'no' }, { nodes: [], edges: [] }]) {
    assert.doesNotThrow(() => validateSpec(junk));
    assert.equal(validateSpec(junk).ok, false);
  }
});
