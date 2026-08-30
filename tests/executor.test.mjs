import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runGraph } from '../src/executor.mjs';
import { validateSpec } from '../src/spec.mjs';
import { stubTransport } from '../src/transport.mjs';
import { renderTrace } from '../src/trace.mjs';

const spec = JSON.parse(readFileSync(new URL('../examples/review-loop.spec.json', import.meta.url)));

/** Verifier fails the first `failTimes` drafts, then passes. */
function impls(failTimes) {
  let seen = 0;
  return {
    research: async () => ({ writes: { findings: 'f1' } }),
    write:    async ({ state }) => ({ writes: { draft: `draft@${state.findings}#${seen}` } }),
    verify:   async () => { const passed = seen++ >= failTimes; return { writes: { verdict: { passed } } }; },
    route:    async () => ({ writes: {} }),
  };
}
const tp = () => stubTransport({ handlers: [{ match: /.*/, reply: 'ok' }] });

test('spec validates', () => {
  const r = validateSpec(spec);
  assert.equal(r.ok, true, JSON.stringify(r.errors, null, 2));
});

test('happy path: conditional edge routes to END, no loop-back', async () => {
  const r = await runGraph(spec, { nodeImpls: impls(0), transport: tp(), input: { brief: 'b' } });
  assert.equal(r.status, 'ok');
  const loops = r.trace.events.filter((e) => e.type === 'loop-back');
  assert.equal(loops.length, 0);
  const toEnd = r.trace.events.find((e) => e.type === 'edge' && e.to === 'END' && e.taken);
  assert.ok(toEnd, 'an edge to END must be taken');
  const skipped = r.trace.events.filter((e) => e.type === 'edge' && !e.taken);
  assert.ok(skipped.length >= 1, 'the false branch must be recorded as not taken');
});

test('loop-back fires and the graph still terminates', async () => {
  const r = await runGraph(spec, { nodeImpls: impls(2), transport: tp(), input: { brief: 'b' } });
  assert.equal(r.status, 'ok');
  const loops = r.trace.events.filter((e) => e.type === 'loop-back');
  assert.equal(loops.length, 2, 'two rejections => two loop-backs');
  const writeRuns = r.trace.events.filter((e) => e.type === 'node:start' && e.node === 'write');
  assert.equal(writeRuns.length, 3, 'write runs once + twice more after rejection');
  assert.equal(writeRuns.at(-1).iteration, 3);
});

test('a never-passing verifier is bounded by maxLoopBacks, not run away', async () => {
  const r = await runGraph(spec, { nodeImpls: impls(Infinity), transport: tp(), input: { brief: 'b' } });
  assert.equal(r.status, 'halted:cap:maxLoopBacks');
  const halt = r.trace.events.find((e) => e.type === 'halt');
  assert.match(halt.detail, /looped 4 times, cap 3/);
  assert.ok(r.steps <= spec.caps.maxSteps, 'must halt before maxSteps, on the tighter loop cap');
});

test('spend cap halts the run', async () => {
  const capped = { ...spec, caps: { ...spec.caps, maxSpendUsd: 0.0015 } };
  const transport = stubTransport({ handlers: [{ match: /.*/, reply: 'ok' }], costPerCall: 0.001 });
  const spendy = { ...impls(Infinity) };
  for (const k of Object.keys(spendy)) {
    const inner = spendy[k];
    spendy[k] = async (ctx) => { await ctx.ask('burn'); return inner(ctx); };
  }
  const r = await runGraph(capped, { nodeImpls: spendy, transport, input: { brief: 'b' } });
  assert.equal(r.status, 'halted:maxSpendUsd');
});

test('trace renders without throwing and names the loop-back', async () => {
  const r = await runGraph(spec, { nodeImpls: impls(1), transport: tp(), input: { brief: 'b' } });
  const out = renderTrace(r.trace);
  assert.match(out, /loop-back into write/);
  assert.match(out, /node runs/);
});
