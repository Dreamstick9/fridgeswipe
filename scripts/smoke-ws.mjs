import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { validateEvent } from '../src/contract.mjs';
import { markerScan } from '../redflag/detector.mjs';
import { CALLS } from '../redflag/fixtures/calls.mjs';
import { startServer } from '../server/server.mjs';

const fixture = CALLS.find((call) => call.id === 'digital-arrest');
const llm = {
  async complete({ prompt }) {
    const text = prompt.replace(/^TRANSCRIPT:\n/, '');
    return { text: JSON.stringify({
      flags: markerScan(text).map(({ technique, quote }) => ({ technique, quote, confidence: 0.92 })),
    }) };
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = startServer({ port: 0, llm });
const events = [];
let socket;

try {
  await server.listening;
  const health = await fetch(`http://127.0.0.1:${server.port}/health`);
  assert.equal(health.ok, true, 'health request failed');
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true, 'health response was not ok:true');

  socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString());
    assert.deepEqual(validateEvent(event), [], `invalid event: ${raw}`);
    events.push(event);
  });

  const waitForEvent = (predicate, message) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), 5000);
    const check = () => {
      const event = events.find(predicate);
      if (event) {
        clearTimeout(timeout);
        resolve(event);
      } else setTimeout(check, 20);
    };
    check();
  });

  socket.send('not-json');
  const badMessage = await waitForEvent((event) => event.type === 'error', 'timed out waiting for bad message error');
  assert.equal(badMessage.message, 'bad message');
  assert.equal(socket.readyState, WebSocket.OPEN, 'connection did not survive malformed message');

  for (const [index, line] of fixture.text.split('\n').entries()) {
    socket.send(JSON.stringify({ type: 'chunk', text: line, tMs: index * 300 }));
    await sleep(300);
  }
  socket.send(JSON.stringify({ type: 'end' }));

  await waitForEvent((event) => event.type === 'verdict', 'timed out waiting for verdict');

  const risks = events.filter((event) => event.type === 'risk').map((event) => event.score);
  const techniques = new Set(events.filter((event) => event.type === 'flag').map((event) => event.flag.technique));
  const verdict = events.find((event) => event.type === 'verdict');
  assert.ok(events.some((event) => event.type === 'transcript'), 'transcript events missing');
  assert.ok(techniques.size >= 3, `expected at least 3 techniques, got ${techniques.size}`);
  assert.ok(risks.length > 1 && risks.at(-1) > risks[0], `risk did not increase: ${risks.join(', ')}`);
  assert.equal(verdict.scam, true, 'final verdict was not scam=true');
  console.log('PASS smoke-ws');
} catch (error) {
  console.error(`FAIL smoke-ws: ${error.message}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  await server.close();
}
