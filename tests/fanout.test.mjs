import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runGraph } from '../src/executor.mjs';
import { stubTransport } from '../src/transport.mjs';

const spec = JSON.parse(readFileSync(new URL('../examples/fanout.spec.json', import.meta.url)));

test('fan-out runs branches concurrently and the join waits for all of them', async () => {
  const order = [];
  let concurrent = 0, peak = 0;
  const branch = (id) => async () => {
    concurrent++; peak = Math.max(peak, concurrent);
    await new Promise((r) => setTimeout(r, 10));
    concurrent--; order.push(id);
    return { writes: { [id]: `${id}-out` } };
  };
  const impls = {
    plan: async () => ({ writes: { plan: 'p' } }),
    legal: branch('legal'), perf: branch('perf'), sec: branch('sec'),
    merge: async ({ state }) => {
      for (const b of ['legal', 'perf', 'sec']) assert.ok(state[b], `join ran before "${b}" completed`);
      return { writes: { merged: 'm' } };
    },
    judge: async () => ({ writes: { verdict: { passed: true } } }),
  };
  const r = await runGraph(spec, {
    nodeImpls: impls,
    transport: stubTransport({ handlers: [{ match: /.*/, reply: 'ok' }] }),
    input: { topic: 't' },
  });
  assert.equal(r.status, 'ok');
  assert.equal(peak, 3, 'all three lenses must be in flight at once');
  const fan = r.trace.events.find((e) => e.type === 'fan-out');
  assert.deepEqual(fan.branches, ['legal', 'perf', 'sec']);
  const merges = r.trace.events.filter((e) => e.type === 'node:start' && e.node === 'merge');
  assert.equal(merges.length, 1, 'join must run exactly once, not once per branch');
});
