// Live E2E: a full trial through the real court server — real Groq, real ElevenLabs.
// Also captures the event stream to app/demoCase.json and the spoken verdict to
// app/assets/audio/verdict-demo.mp3, so the app has a wifi-proof offline replay.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { startCourtServer } from '../server/court.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CASE = {
  type: 'case',
  caseA: {
    name: 'Rahul',
    transcript: 'Your honour, I had one container of biryani left over from Sunday. I wrote my name on it. I drew a skull on it. It was gone by Tuesday and Vikram smelled like saffron. I demand justice and also the empty container back.',
  },
  caseB: {
    name: 'Vikram',
    transcript: 'The fridge is a shared space and that biryani was on the communal shelf. Labels expire after forty-eight hours, everyone knows this. Also he has been using my headphones for a month without asking, so honestly, we are even.',
  },
};

const server = startCourtServer({ port: 0 });
await server.listening;
console.log(`court on :${server.port}\n`);

const t0 = Date.now();
const events = [];
const ws = new WebSocket(`ws://localhost:${server.port}`);

const finish = async (code) => { ws.close(); await server.close(); process.exit(code); };
const timer = setTimeout(() => { console.error('❌ trial timed out after 120s'); void finish(1); }, 120_000);

ws.on('open', () => ws.send(JSON.stringify(CASE)));
ws.on('error', (e) => { console.error('ws error', e.message); void finish(1); });
ws.on('message', async (raw) => {
  const ev = JSON.parse(raw.toString());
  const tMs = Date.now() - t0;
  events.push({ tMs, ...ev });

  if (ev.type === 'stage') console.log(`${String(tMs).padStart(6)}ms  ${ev.status === 'running' ? '▶' : ev.status === 'done' ? '✓' : '✗'} ${ev.node}${ev.pass > 1 ? ` (pass ${ev.pass})` : ''}${ev.ms ? `  ${ev.ms}ms` : ''}`);
  else if (ev.type === 'docket') console.log(`${String(tMs).padStart(6)}ms  📋 ${ev.docket.caseTitle} — charges: ${(ev.docket.charges ?? []).join(' | ')}`);
  else if (ev.type === 'argument') console.log(`${String(tMs).padStart(6)}ms  🗣  ${ev.side}: "${ev.argument.opening}"`);
  else if (ev.type === 'exchange') console.log(`${String(tMs).padStart(6)}ms  ⚔  ${ev.record.exchange?.length ?? 0} lines — hinges on: ${ev.record.tension}`);
  else if (ev.type === 'objection') console.log(`${String(tMs).padStart(6)}ms  ${ev.objection.passed ? '☑ examiner satisfied' : `🚨 OBJECTION: ${(ev.objection.reasons ?? []).join('; ')}`}`);
  else if (ev.type === 'error') { console.error(`${String(tMs).padStart(6)}ms  ❌ ${ev.message}`); clearTimeout(timer); void finish(1); }
  else if (ev.type === 'verdict') {
    clearTimeout(timer);
    const v = ev.verdict;
    console.log(`\n⚖️  WINNER: ${v.winner} (${v.split})`);
    console.log(`   ${v.ruling}`);
    console.log(`   SENTENCE: ${v.sentence}`);
    console.log(`   "${v.oneLiner}"`);
    console.log(`   audio: ${ev.audioUrl ?? 'none'}`);

    let audioOk = false;
    if (ev.audioUrl) {
      const res = await fetch(`http://localhost:${server.port}${ev.audioUrl}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(join(ROOT, 'app', 'assets', 'audio'), { recursive: true });
        writeFileSync(join(ROOT, 'app', 'assets', 'audio', 'verdict-demo.mp3'), buf);
        console.log(`   saved verdict-demo.mp3 (${buf.length} bytes)`);
        audioOk = true;
      }
    }

    writeFileSync(join(ROOT, 'app', 'demoCase.json'), JSON.stringify({ caseA: CASE.caseA, caseB: CASE.caseB, events }, null, 1));
    console.log(`   saved demoCase.json (${events.length} events)`);

    const pass = v.winner && v.ruling && audioOk;
    console.log(pass ? '\n✅ SMOKE PASSED' : '\n❌ SMOKE FAILED (missing verdict fields or audio)');
    void finish(pass ? 0 : 1);
  }
});
