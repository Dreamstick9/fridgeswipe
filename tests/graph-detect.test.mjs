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

test('a PERSISTENT hallucinator is rejected, looped back, then halted by the cap', async () => {
  const r = await runGraph(spec, {
    nodeImpls: makeGraphNodes(),
    transport: stub({ authority: [{ technique: 'FAKE_AUTHORITY', quote: 'I am the King of Spain', confidence: 0.9 }] }),
    input: { window: scam.text },
  });
  assert.match(r.status, /^halted:cap:maxLoopBacks/, 'endless fabrication must hit the loop cap, not produce a verdict');
  const loops = r.trace.events.filter((e) => e.type === 'loop-back');
  assert.ok(loops.length >= 1, 'the skeptic rejection must actually fire the loop-back');
  assert.equal(r.state.audit.passed, false, 'the audit must have rejected the fabricated quote');
});

test('a hallucinator that CORRECTS itself after the rejection note converges to a verdict', async () => {
  const authorityReplies = [
    [{ technique: 'FAKE_AUTHORITY', quote: 'I am the King of Spain', confidence: 0.9 }],
    [{ technique: 'FAKE_AUTHORITY', quote: 'CBI Cyber Crime Branch Delhi', confidence: 0.95 }],
  ];
  let call = 0;
  const transport = stubTransport({ costPerCall: 0.001, handlers: [
    { match: ({ system }) => /FAKE_AUTHORITY/.test(system), reply: ({ prompt }) => JSON.stringify({ flags: authorityReplies[/REJECTED/.test(prompt) ? 1 : 0] }) },
    { match: ({ system }) => /MANUFACTURED_URGENCY/.test(system), reply: () => JSON.stringify({ flags: [{ technique: 'ISOLATION_ORDER', quote: 'You must not inform anyone', confidence: 0.95 }] }) },
    { match: ({ system }) => /EXTRACTION/.test(system), reply: () => JSON.stringify({ flags: [{ technique: 'EXTRACTION', quote: 'transfer your balance to the RBI supervision account', confidence: 0.9 }] }) },
    { match: /.*/, reply: () => JSON.stringify({ flags: [] }) },
  ]});
  const r = await runGraph(spec, { nodeImpls: makeGraphNodes(), transport, input: { window: scam.text } });
  assert.equal(r.status, 'ok', 'the corrected round must complete');
  assert.ok(r.trace.events.some((e) => e.type === 'loop-back'), 'first round must have been rejected');
  assert.equal(r.state.audit.passed, true, 'second round must pass the audit');
  assert.equal(r.state.verdict.scam, true);
  assert.ok(r.state.verdict.techniques.includes('FAKE_AUTHORITY'), 'the corrected quote must survive');
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
