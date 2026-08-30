// KANGAROO COURT — live trial server.
// The phone sends two spoken testimonies; the multi-agent courtroom graph runs
// (clerk → dueling advocates → hearing → cross-examiner → judge) and every stage
// streams back to the phone as it lands. The judge's ruling is spoken by ElevenLabs.

import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

import { loadEnv, makeLLM } from '../src/llm.mjs';
import { runGraph } from '../src/executor.mjs';
import { createTrace } from '../src/trace.mjs';
import { makeNodeImpls } from '../court/nodes.mjs';
import { transcribe } from './transcribe.mjs';
import { speak } from './tts.mjs';

loadEnv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));

const SPEC = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'court', 'courtroom.spec.json'), 'utf8'));

const DEFAULT_PORT = 8787;
const LLM_TIMEOUT_MS = 25_000;
const MAX_TESTIMONY_CHARS = 4_000;
const MAX_NAME_CHARS = 40;

// The payload event each node's writes become, so the app can stage the drama live.
const PAYLOAD = {
  clerk:      (w, pass) => ({ type: 'docket', docket: w.docket }),
  advocate_a: (w, pass) => ({ type: 'argument', side: 'A', argument: w.argA, pass }),
  advocate_b: (w, pass) => ({ type: 'argument', side: 'B', argument: w.argB, pass }),
  hearing:    (w, pass) => ({ type: 'exchange', record: w.record, pass }),
  examiner:   (w, pass) => ({ type: 'objection', objection: w.objection, pass }),
};
const STAGED = new Set(['clerk', 'advocate_a', 'advocate_b', 'hearing', 'examiner', 'judge']);

const send = (ws, event) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event)); };

/** Trace whose lifecycle hooks stream the trial to the client as it happens. */
function liveTrace(onEvent) {
  const t = createTrace({ name: 'kangaroo-court' });
  const passes = Object.create(null);
  const started = new Map();
  const { nodeStart, nodeEnd, nodeError } = t;
  t.nodeStart = (id, kind, iteration) => {
    passes[id] = iteration;
    if (STAGED.has(id)) { started.set(id, Date.now()); onEvent({ type: 'stage', node: id, status: 'running', pass: iteration }); }
    return nodeStart(id, kind, iteration);
  };
  t.nodeEnd = (id, x) => {
    const pass = passes[id] ?? 1;
    if (STAGED.has(id)) onEvent({ type: 'stage', node: id, status: 'done', pass, ms: Date.now() - (started.get(id) ?? Date.now()) });
    const payload = PAYLOAD[id]?.(x.writes ?? {}, pass);
    if (payload) onEvent(payload);
    return nodeEnd(id, x);
  };
  t.nodeError = (id, message) => {
    if (STAGED.has(id)) onEvent({ type: 'stage', node: id, status: 'error', pass: passes[id] ?? 1 });
    return nodeError(id, message);
  };
  return t;
}

function cleanSide(raw, fallbackName) {
  if (!raw || typeof raw !== 'object') return null;
  const transcript = typeof raw.transcript === 'string' ? raw.transcript.trim().slice(0, MAX_TESTIMONY_CHARS) : '';
  if (!transcript) return null;
  const name = (typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackName).slice(0, MAX_NAME_CHARS);
  return { name, transcript };
}

/** Everything the judge says out loud, in one breath. */
export function verdictScript(verdict, { caseA, caseB } = {}) {
  const winnerName = verdict.winner === 'A' ? caseA?.name : verdict.winner === 'B' ? caseB?.name : null;
  const parts = [
    verdict.ruling,
    winnerName ? `The court rules in favour of ${winnerName}, ${verdict.split || 'unanimously'}.` : '',
    verdict.sentence ? `The sentence: ${verdict.sentence}.` : '',
    verdict.oneLiner ? `Let the record show: ${verdict.oneLiner}` : '',
  ];
  return parts.filter(Boolean).join(' ').slice(0, 850);
}

/** One direct judge call over whatever state survived — the fallback gavel. */
async function emergencyJudgment(model, input, state = {}) {
  const { extractJson } = await import('../src/transport.mjs');
  const { text } = await model.complete({
    system: `Setting: KANGAROO COURT — a gloriously over-the-top courtroom for petty disputes.
You are THE HONOURABLE JUDGE. Booming, final, secretly delighted. Fair on the merits, funny in the delivery.`,
    prompt: `Side A — ${input.caseA.name}: """${input.caseA.transcript}"""
Side B — ${input.caseB.name}: """${input.caseB.transcript}"""
${state.docket ? `Docket: ${JSON.stringify(state.docket)}` : ''}
${state.record ? `Partial record: ${JSON.stringify(state.record)}` : ''}

The advocates have exhausted the court's patience. Rule NOW. Return JSON only:
{"winner":"A|B|split","split":"<vote like 3-2>","ruling":"<theatrical 2-3 sentence ruling, starts with 'ORDER! ORDER!'>",
"sentence":"<one funny, doable compensation the loser owes>","oneLiner":"<the shareable zinger, max 12 words>"}`,
  });
  return extractJson(text);
}

function setupConnection(ws, { llm, llmFactory, tts, audioStore }) {
  let busy = false;

  const runTrial = async (input) => {
    busy = true;
    try {
      loadEnv();
      const model = llm ?? llmFactory?.() ?? makeLLM();
      // The courtroom wants flair (temperature up) and generous token headroom —
      // reasoning models burn max_tokens on thinking before the JSON comes out.
      const theatrical = {
        ...model,
        get spentUsd() { return model.spentUsd; },
        complete: (args) => model.complete({
          ...args,
          temperature: 0.85,
          maxTokens: 2000,
          ...(/gpt-oss/.test(model.model ?? '') ? { extra: { reasoning_effort: 'low' } } : {}),
          signal: args?.signal ?? AbortSignal.timeout(LLM_TIMEOUT_MS),
        }),
      };

      const result = await runGraph(SPEC, {
        nodeImpls: makeNodeImpls(),
        transport: theatrical,
        input,
        trace: liveTrace((ev) => send(ws, ev)),
      });

      let verdict = result.state.verdict;
      if (result.status !== 'ok' || !verdict) {
        // The show must end in a ruling. If the graph halted (loop caps, a flaky
        // pass), the judge rules directly on whatever made it into the record.
        console.error(`graph ${result.status} — emergency judgment`);
        send(ws, { type: 'stage', node: 'judge', status: 'running', pass: 1 });
        try {
          verdict = await emergencyJudgment(theatrical, input, result.state);
          send(ws, { type: 'stage', node: 'judge', status: 'done', pass: 1 });
        } catch (e) {
          send(ws, { type: 'stage', node: 'judge', status: 'error', pass: 1 });
          send(ws, { type: 'error', message: `the court adjourned unexpectedly (${result.status})` });
          return;
        }
      }
      let audioUrl = null;
      try {
        const audio = await (tts ?? speak)(verdictScript(verdict, input));
        const id = randomUUID();
        audioStore.set(id, audio);
        if (audioStore.size > 20) audioStore.delete(audioStore.keys().next().value);
        audioUrl = `/audio/${id}.mp3`;
      } catch (e) {
        console.error(`tts skipped: ${String(e.message).slice(0, 120)}`);
      }
      send(ws, { type: 'verdict', verdict, audioUrl });
    } catch (error) {
      send(ws, { type: 'error', message: `trial failed: ${String(error?.message || 'unknown error').slice(0, 200)}` });
    } finally {
      busy = false;
    }
  };

  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', message: 'bad message' }); return; }
    if (!message || message.type !== 'case') { send(ws, { type: 'error', message: 'bad message' }); return; }
    if (busy) { send(ws, { type: 'error', message: 'court is already in session' }); return; }
    const caseA = cleanSide(message.caseA, 'Side A');
    const caseB = cleanSide(message.caseB, 'Side B');
    if (!caseA || !caseB) { send(ws, { type: 'error', message: 'both sides must state their case' }); return; }
    void runTrial({ caseA, caseB });
  });
}

export function startCourtServer({ port = process.env.SERVER_PORT || DEFAULT_PORT, llm, llmFactory, tts } = {}) {
  const startedAt = Date.now();
  const provider = llm?.kind ?? process.env.LLM_PROVIDER ?? 'groq';
  const audioStore = new Map();

  const httpServer = createHttpServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, court: 'in session', provider, uptimeS: Math.floor((Date.now() - startedAt) / 1000) }));
      return;
    }

    if (req.method === 'POST' && req.url === '/transcribe') {
      const chunks = [];
      req.on('data', (c) => { chunks.push(c); if (Buffer.concat(chunks).length > 12_000_000) req.destroy(); });
      req.on('end', async () => {
        try {
          const text = await transcribe(Buffer.concat(chunks), { filename: 'testimony.m4a' });
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ text }));
        } catch (e) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: String(e.message).slice(0, 160) }));
        }
      });
      return;
    }

    const audioMatch = req.method === 'GET' && /^\/audio\/([0-9a-f-]+)\.mp3$/.exec(req.url ?? '');
    if (audioMatch) {
      const buf = audioStore.get(audioMatch[1]);
      if (!buf) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': buf.length });
      res.end(buf);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    setupConnection(ws, { llm, llmFactory, tts, audioStore });
  });
  const keepalive = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else { ws.isAlive = false; ws.ping(); }
    }
  }, 15_000);
  keepalive.unref();

  const listening = new Promise((resolve) => httpServer.once('listening', resolve));
  httpServer.listen(Number(port));
  return {
    httpServer,
    wss,
    listening,
    audioStore,
    get port() { return httpServer.address()?.port; },
    async close() {
      clearInterval(keepalive);
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = startCourtServer();
  await server.listening;
  console.log(`⚖️  KANGAROO COURT in session on ws://localhost:${server.port}`);
}
