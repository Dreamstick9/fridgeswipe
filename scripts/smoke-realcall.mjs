import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

import { validateEvent } from '../src/contract.mjs';
import { startServer } from '../server/server.mjs';

const REQUIRED_AGENTS = ['authority_agent', 'pressure_agent', 'money_agent', 'skeptic', 'ruling'];

const UTTERANCES = [
  'This is Inspector Sharma from the C B I cyber cell. A parcel with drugs was found in your name.',
  'You are under digital arrest. Do not tell your family or anyone about this call.',
  'Transfer ninety thousand rupees to the R B I supervision account right now or a warrant will be issued.',
];
const VERDICT_TIMEOUT_MS = 60_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function waitForVerdict(events) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const verdict = events.find((event) => event.type === 'verdict');
      if (verdict) return resolve(verdict);
      if (Date.now() - started >= VERDICT_TIMEOUT_MS) {
        return reject(new Error('timed out waiting for verdict (60s)'));
      }
      setTimeout(check, 50);
    };
    check();
  });
}

const server = startServer({ port: 0 });
const events = [];
let socket;
let workDir;

try {
  await server.listening;
  socket = new WebSocket(`ws://localhost:${server.port}`);
  await waitForOpen(socket);
  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString());
    assert.deepEqual(validateEvent(event), [], `invalid event: ${raw}`);
    events.push(event);
  });

  workDir = await mkdtemp(join(tmpdir(), 'red-flag-realcall-'));
  for (const [index, utterance] of UTTERANCES.entries()) {
    const aiff = join(workDir, `in-${index}.aiff`);
    const wav = join(workDir, `out-${index}.wav`);
    await run('say', ['-o', aiff, utterance], workDir);
    await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav], workDir);

    const response = await fetch(`http://localhost:${server.port}/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: await readFile(wav),
    });
    const body = await response.json();
    assert.equal(response.ok, true, `transcribe failed: ${JSON.stringify(body)}`);
    assert.equal(typeof body.text, 'string', 'transcribe response did not contain text');
    assert.ok(body.text.trim().length > 10, `unrecognizable transcript: ${JSON.stringify(body.text)}`);
    assert.match(body.text, /[a-z]{3}/i, `transcript contained no recognizable words: ${body.text}`);

    socket.send(JSON.stringify({ type: 'chunk', text: body.text, tMs: index * 1_000 }));
    await sleep(1_000);
  }

  socket.send(JSON.stringify({ type: 'end' }));
  const verdict = await waitForVerdict(events);
  const techniques = new Set(events
    .filter((event) => event.type === 'flag')
    .map((event) => event.flag.technique));

  assert.ok(techniques.size >= 3, `expected at least 3 distinct techniques, got ${[...techniques]}`);
  assert.ok(techniques.has('ISOLATION_ORDER'), 'ISOLATION_ORDER flag missing');
  assert.ok(techniques.has('EXTRACTION'), 'EXTRACTION flag missing');
  assert.equal(verdict.scam, true, 'final verdict was not scam=true');

  console.log('\nTimeline');
  for (const event of events) {
    const technique = event.type === 'flag' ? event.flag.technique : '-';
    const tMs = event.type === 'flag' ? event.flag.tMs
      : event.type === 'transcript' ? event.tMs : '-';
    console.log(`${String(tMs).padStart(5)}ms  ${event.type.padEnd(10)}  ${technique}`);
  }
  {
  const agentDone = new Set(events.filter((e) => e.type === 'agent' && e.status === 'done').map((e) => e.agent));
  const missing = REQUIRED_AGENTS.filter((a) => !agentDone.has(a));
  if (missing.length) throw new Error(`multi-agent evidence missing: ${missing.join(', ')} never completed`);
  const running = events.filter((e) => e.type === 'agent' && e.status === 'running').map((e) => e.agent);
  const firstDoneIdx = events.findIndex((e) => e.type === 'agent' && e.status === 'done');
  const runningBeforeFirstDone = new Set(events.slice(0, firstDoneIdx).filter((e) => e.type === 'agent' && e.status === 'running').map((e) => e.agent));
  if (runningBeforeFirstDone.size < 3) throw new Error(`specialists did not fan out in parallel (only ${[...runningBeforeFirstDone].join(', ')} running before first completion)`);
  console.log(`agents verified: ${[...agentDone].join(', ')} (${runningBeforeFirstDone.size} concurrent)`);
}
console.log('PASS smoke-realcall');
} catch (error) {
  console.error(`FAIL smoke-realcall: ${error.message}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  await server.close();
  if (workDir) await rm(workDir, { recursive: true, force: true });
}
