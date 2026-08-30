import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startCourtServer, verdictScript } from '../server/court.mjs';
import { stubTransport } from '../src/transport.mjs';

const INPUT = {
  type: 'case',
  caseA: { name: 'Aman', transcript: 'He never does the dishes and claims coding is labor.' },
  caseB: { name: 'Priya', transcript: 'I cook every day; the least he can do is dishes.' },
};

// Examiner objects once, then is satisfied — exercises the loop-back on the live path.
function courtStub() {
  let exams = 0;
  return stubTransport({
    costPerCall: 0.002,
    handlers: [
      { match: ({ system }) => /COURT CLERK/.test(system), reply: () => ({ caseTitle: 'Aman v. Priya', charges: ['dish evasion'], summary: 'A dispute over dishes.' }) },
      { match: ({ system }) => /ADVOCATE A/.test(system), reply: ({ prompt }) => ({ opening: /OBJECTED/.test(prompt) ? 'Round two!' : 'Round one!', points: ['a1'], concession: 'c' }) },
      { match: ({ system }) => /ADVOCATE B/.test(system), reply: ({ prompt }) => ({ opening: /OBJECTED/.test(prompt) ? 'Round two!' : 'Round one!', points: ['b1'], concession: 'c' }) },
      { match: ({ system }) => /COURT REPORTER/.test(system), reply: () => ({ exchange: [{ speaker: 'ADVOCATE A', line: 'x' }, { speaker: 'ADVOCATE B', line: 'y' }], tension: 't' }) },
      { match: ({ system }) => /CROSS-EXAMINER/.test(system), reply: () => (exams++ === 0 ? { passed: false, reasons: ['dodged the labor claim'], weakSide: 'A' } : { passed: true, reasons: [], weakSide: 'none' }) },
      { match: ({ system }) => /HONOURABLE JUDGE/.test(system), reply: () => ({ winner: 'B', split: '4-1', ruling: 'ORDER! ORDER! Dishes are owed.', sentence: 'one week of dishes', oneLiner: 'Dish duty is love.' }) },
    ],
  });
}

function collectTrial(port, payload) {
  return new Promise((resolve, reject) => {
    const events = [];
    const ws = new WebSocket(`ws://localhost:${port}`);
    const timer = setTimeout(() => { ws.close(); reject(new Error(`trial timed out; got: ${events.map((e) => e.type).join(',')}`)); }, 8000);
    ws.on('open', () => ws.send(JSON.stringify(payload)));
    ws.on('message', (raw) => {
      const ev = JSON.parse(raw.toString());
      events.push(ev);
      if (ev.type === 'verdict' || ev.type === 'error') { clearTimeout(timer); ws.close(); resolve(events); }
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

test('full trial over the wire: stages, objection loop, verdict with audio', async () => {
  const fakeTts = async (text) => Buffer.from(`MP3:${text.slice(0, 20)}`);
  const server = startCourtServer({ port: 0, llm: courtStub(), tts: fakeTts });
  await server.listening;
  try {
    const events = await collectTrial(server.port, INPUT);
    const types = events.map((e) => e.type);

    // choreography: every staged node ran and reported both running and done
    for (const node of ['clerk', 'advocate_a', 'advocate_b', 'hearing', 'examiner', 'judge']) {
      assert.ok(events.some((e) => e.type === 'stage' && e.node === node && e.status === 'running'), `${node} running`);
      assert.ok(events.some((e) => e.type === 'stage' && e.node === node && e.status === 'done'), `${node} done`);
    }
    // the objection loop reached the client: advocates argue twice, second pass labeled
    assert.equal(events.filter((e) => e.type === 'argument' && e.side === 'A').length, 2);
    assert.ok(events.some((e) => e.type === 'argument' && e.pass === 2 && e.argument.opening === 'Round two!'));
    // both examiner outcomes streamed
    const objections = events.filter((e) => e.type === 'objection');
    assert.equal(objections.length, 2);
    assert.equal(objections[0].objection.passed, false);
    assert.equal(objections[1].objection.passed, true);
    // payloads
    assert.ok(events.some((e) => e.type === 'docket' && e.docket.caseTitle === 'Aman v. Priya'));
    assert.ok(events.some((e) => e.type === 'exchange' && e.record.exchange.length === 2));

    const verdict = events.at(-1);
    assert.equal(verdict.type, 'verdict');
    assert.equal(verdict.verdict.winner, 'B');
    assert.match(verdict.verdict.ruling, /^ORDER! ORDER!/);
    assert.match(verdict.audioUrl, /^\/audio\/[0-9a-f-]+\.mp3$/);

    // the synthesized audio is actually served
    const res = await fetch(`http://localhost:${server.port}${verdict.audioUrl}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    const body = Buffer.from(await res.arrayBuffer());
    assert.match(body.toString(), /^MP3:/);

    assert.ok(!types.includes('error'), `no errors: ${JSON.stringify(events.find((e) => e.type === 'error'))}`);
  } finally {
    await server.close();
  }
});

test('a TTS outage never blocks the verdict', async () => {
  const server = startCourtServer({ port: 0, llm: courtStub(), tts: async () => { throw new Error('elevenlabs down'); } });
  await server.listening;
  try {
    const events = await collectTrial(server.port, INPUT);
    const verdict = events.at(-1);
    assert.equal(verdict.type, 'verdict');
    assert.equal(verdict.audioUrl, null);
  } finally {
    await server.close();
  }
});

test('malformed and incomplete cases are refused politely', async () => {
  const server = startCourtServer({ port: 0, llm: courtStub(), tts: async () => Buffer.from('x') });
  await server.listening;
  try {
    const bad = await collectTrial(server.port, { type: 'nonsense' });
    assert.equal(bad.at(-1).type, 'error');
    const oneSided = await collectTrial(server.port, { type: 'case', caseA: { name: 'A', transcript: 'only me' } });
    assert.equal(oneSided.at(-1).type, 'error');
    assert.match(oneSided.at(-1).message, /both sides/);
  } finally {
    await server.close();
  }
});

test('health route answers', async () => {
  const server = startCourtServer({ port: 0, llm: courtStub() });
  await server.listening;
  try {
    const res = await fetch(`http://localhost:${server.port}/health`);
    const j = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.court, 'in session');
  } finally {
    await server.close();
  }
});

test('verdictScript names the winner and stays speakable', () => {
  const script = verdictScript(
    { winner: 'B', split: '4-1', ruling: 'ORDER! ORDER! Dishes are owed.', sentence: 'one week of dishes', oneLiner: 'Dish duty is love.' },
    { caseA: { name: 'Aman' }, caseB: { name: 'Priya' } },
  );
  assert.match(script, /Priya/);
  assert.match(script, /4-1/);
  assert.match(script, /The sentence: one week of dishes/);
  assert.ok(script.length <= 850);
});
