import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runGraph } from '../src/executor.mjs';
import { validateSpec } from '../src/spec.mjs';
import { stubTransport } from '../src/transport.mjs';
import { makeNodeImpls } from '../court/nodes.mjs';

const spec = JSON.parse(readFileSync(new URL('../court/courtroom.spec.json', import.meta.url)));
const INPUT = {
  caseA: { name: 'Aman', transcript: 'He never does the dishes and claims coding is labor.' },
  caseB: { name: 'Priya', transcript: 'I cook every day; the least he can do is dishes.' },
};

// Stub court: examiner objects on the first pass, is satisfied on the second.
function courtStub() {
  let exams = 0;
  return stubTransport({
    costPerCall: 0.002,
    handlers: [
      { match: ({ system }) => /COURT CLERK/.test(system), reply: () => ({ caseTitle: 'Aman v. Priya', charges: ['dish evasion'], summary: 'A dispute over dishes.' }) },
      { match: ({ system }) => /ADVOCATE A/.test(system), reply: ({ prompt }) => ({ opening: /OBJECTED/.test(prompt) ? 'Round two!' : 'Round one!', points: ['a1'], concession: 'c' }) },
      { match: ({ system }) => /ADVOCATE B/.test(system), reply: ({ prompt }) => ({ opening: /OBJECTED/.test(prompt) ? 'Round two!' : 'Round one!', points: ['b1'], concession: 'c' }) },
      { match: ({ system }) => /COURT REPORTER/.test(system), reply: () => ({ exchange: [{ speaker: 'ADVOCATE A', line: 'x' }], tension: 't' }) },
      { match: ({ system }) => /CROSS-EXAMINER/.test(system), reply: () => (exams++ === 0 ? { passed: false, reasons: ['dodged the labor claim'], weakSide: 'A' } : { passed: true, reasons: [], weakSide: 'none' }) },
      { match: ({ system }) => /HONOURABLE JUDGE/.test(system), reply: () => ({ winner: 'B', split: '4-1', ruling: 'ORDER! ORDER! Dishes are owed.', sentence: 'one week of dishes', oneLiner: 'Dish duty is love.' }) },
    ],
  });
}

test('courtroom spec passes the spec floor', () => {
  const r = validateSpec(spec);
  assert.equal(r.ok, true, JSON.stringify(r.errors, null, 2));
});

test('full trial: fan-out, join, objection loop-back into BOTH advocates, verdict', async () => {
  const r = await runGraph(spec, { nodeImpls: makeNodeImpls(), transport: courtStub(), input: INPUT });
  assert.equal(r.status, 'ok', JSON.stringify(r.trace.events.filter((e) => e.type === 'halt')));

  const starts = (id) => r.trace.events.filter((e) => e.type === 'node:start' && e.node === id).length;
  assert.equal(starts('advocate_a'), 2, 'advocate A argues twice (objection round)');
  assert.equal(starts('advocate_b'), 2, 'advocate B argues twice');
  assert.equal(starts('hearing'), 2, 'the join must re-fire after the loop-back');
  assert.equal(starts('examiner'), 2);
  assert.equal(starts('judge'), 1, 'exactly one verdict');

  const loops = r.trace.events.filter((e) => e.type === 'loop-back');
  assert.equal(loops.length, 2, 'one loop-back per advocate');
  const fans = r.trace.events.filter((e) => e.type === 'fan-out');
  assert.ok(fans.length >= 2, 'initial fan-out + objection fan-out');
  assert.ok(r.trace.events.some((e) => e.type === 'edge' && e.to === 'judge' && e.taken));

  assert.equal(r.state.verdict.winner, 'B');
  assert.match(r.state.verdict.ruling, /^ORDER! ORDER!/);
  // the objection actually reached the advocates' second round
  assert.equal(r.state.argA.opening, 'Round two!');
});

test('an examiner that never accepts is bounded by the loop caps', async () => {
  let calls = 0;
  const stub = stubTransport({
    handlers: [
      { match: ({ system }) => /CROSS-EXAMINER/.test(system), reply: () => ({ passed: false, reasons: ['never satisfied'], weakSide: 'both' }) },
      { match: /.*/, reply: () => ({ opening: `o${calls++}`, points: [], concession: '', exchange: [], tension: '', caseTitle: 't', charges: [], summary: 's' }) },
    ],
  });
  const r = await runGraph(spec, { nodeImpls: makeNodeImpls(), transport: stub, input: INPUT });
  assert.match(r.status, /^halted:cap:maxLoopBacks/);
});
