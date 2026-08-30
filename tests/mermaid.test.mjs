import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { specToMermaid } from '../src/mermaid.mjs';

const load = (p) => JSON.parse(readFileSync(new URL(`../examples/${p}`, import.meta.url)));

test('renders every node and edge, and marks loop-backs dashed', () => {
  const spec = load('review-loop.spec.json');
  const out = specToMermaid(spec);
  assert.match(out, /^flowchart TD/);
  for (const n of spec.nodes) assert.ok(out.includes(n.id), `missing node ${n.id}`);
  assert.match(out, /route -\.->\|"verdict\.passed == false"\| write/, 'loop-back must be dashed and labelled');
  assert.match(out, /class verify verify;/);
});

test('fan-out and join both appear', () => {
  const out = specToMermaid(load('fanout.spec.json'));
  assert.match(out, /plan -->\|fan-out\| legal/);
  assert.match(out, /legal -\.-\|join\| merge/);
});

test('a trace marks which nodes actually ran', () => {
  const spec = load('review-loop.spec.json');
  const trace = { events: [{ type: 'node:start', node: 'research' }, { type: 'node:start', node: 'write' }] };
  const out = specToMermaid(spec, { trace });
  assert.match(out, /class research,write ran;/);
});

test('quotes in labels do not break the diagram', () => {
  const spec = { nodes: [{ id: 'a', kind: 'produce' }], edges: [{ from: 'a', to: 'END', when: 'x == "y"' }] };
  const out = specToMermaid(spec);
  assert.ok(!/"[^|]*"[^|]*"[^|]*"\|/.test(out.split('\n').find((l) => l.includes('-->'))), 'no unescaped nested quotes');
  assert.match(out, /x == 'y'/);
});
