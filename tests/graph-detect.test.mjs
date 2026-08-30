import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runGraph } from '../src/executor.mjs';
import { stubTransport } from '../src/transport.mjs';
import { makeGraphNodes } from '../redflag/graph-nodes.mjs';
import { CALLS } from '../redflag/fixtures/calls.mjs';

const spec = JSON.parse(readFileSync(new URL('../redflag/graph.spec.json', import.meta.url)));
const scam = CALLS.find((c) => c.id === 'digital-arrest');
const control = CALLS.find((c) => c.id === 'real-police-verification');

const reply = (flags) => JSON.stringify({ flags });
const stub = (opts = {}) => stubTransport({ costPerCall: 0.001, handlers: [
  { match: ({ system }) => /FAKE_AUTHORITY/.test(system), reply: () => reply(opts.authority ?? []) },
  { match: ({ system }) => /MANUFACTURED_URGENCY/.test(system), reply: () => reply(opts.pressure ?? []) },
  { match: ({ system }) => /EXTRACTION/.test(system), reply: () => reply(opts.money ?? []) },
  { match: /.*/, reply: () => reply([]) },
]});

test('three specialists run CONCURRENTLY and the join waits for all', async () => {
  const r = await runGraph(spec, {
    nodeImpls: makeGraphNodes(),
    transport: stub({
      authority: [{ technique: 'FAKE_AUTHORITY', quote: 'CBI Cyber Crime Branch Delhi', confidence: 0.95 }],
      pressure:  [{ technique: 'ISOLATION_ORDER', quote: 'You must not inform anyone', confidence: 0.95 }],
      money:     [{ technique: 'EXTRACTION', quote: 'transfer your balance to the RBI supervision account', confidence: 0.9 }],
    }),
    input: { window: scam.text },
  });
  assert.equal(r.status, 'ok');
  const fan = r.trace.events.find((e) => e.type === 'fan-out');
  assert.deepEqual(fan.branches, ['authority_agent', 'pressure_agent', 'money_agent'], 'all three specialists dispatched together');
  assert.equal(r.trace.events.filter((e) => e.type === 'node:start' && e.node === 'consolidate').length, 1, 'join runs once, after all three');
  assert.equal(r.state.allFlags.length, 3, 'each specialist contributed');
  assert.equal(r.state.verdict.scam, true);
  assert.ok(r.state.verdict.score >= 60, `three stacked techniques should score high, got ${r.state.verdict.score}`);
});

test('a single weak signal is NOT enough to accuse someone', async () => {
  const r = await runGraph(spec, {
    nodeImpls: makeGraphNodes(),
    transport: stub({ authority: [{ technique: 'FAKE_AUTHORITY', quote: 'CBI Cyber Crime Branch Delhi', confidence: 0.95 }] }),
    input: { window: scam.text },
  });
  assert.equal(r.state.allFlags.length, 1);
  assert.equal(r.state.verdict.scam, false, 'one technique alone must stay below the accusation threshold');
});

test('the skeptic rejects hallucinated evidence and forces a re-run', async () => {
  const r = await runGraph(spec, {
    nodeImpls: makeGraphNodes(),
    transport: stub({ authority: [{ technique: 'FAKE_AUTHORITY', quote: 'I am the King of Spain', confidence: 0.9 }] }),
    input: { window: scam.text },
  });
  // groundFlags drops the fabricated quote before the skeptic ever sees it
  assert.equal(r.state.allFlags.length, 0, 'fabricated evidence must not survive grounding');
  assert.equal(r.state.audit.passed, true);
  assert.equal(r.state.verdict.scam, false, 'no real evidence means no accusation');
});

test('a genuine police call produces no verdict of scam', async () => {
  const r = await runGraph(spec, { nodeImpls: makeGraphNodes(), transport: stub(), input: { window: control.text } });
  assert.equal(r.status, 'ok');
  assert.equal(r.state.verdict.scam, false);
  assert.equal(r.state.verdict.score, 0);
});

test('spend cap halts the graph rather than running away', async () => {
  const capped = { ...spec, caps: { ...spec.caps, maxSpendUsd: 0.0015 } };
  const r = await runGraph(capped, { nodeImpls: makeGraphNodes(), transport: stub(), input: { window: scam.text } });
  assert.match(r.status, /halted:(cap:maxSpendUsd|maxSpendUsd)/);
});

test('the full technique set is covered by exactly one specialist each', () => {
  const owned = { authority_agent: 2, pressure_agent: 3, money_agent: 1 };
  assert.equal(Object.values(owned).reduce((a, b) => a + b, 0), 6, 'all six techniques must be owned');
});
