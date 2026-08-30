import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { validateEvent, bandFor } from '../src/contract.mjs';
import { loadEnv, makeLLM } from '../src/llm.mjs';
import {
  assess, llmDetect, markerScan, mergeFlags, resetIds,
} from '../redflag/detector.mjs';

const DEFAULT_PORT = 8787;
const WINDOW_CHARS = 900;
const LLM_TIMEOUT_MS = 12_000;

const validTime = (value, fallback = 0) => (
  Number.isFinite(value) && value >= 0 ? value : fallback
);

function sendEvent(ws, event) {
  const errors = validateEvent(event);
  if (errors.length) {
    console.error(`Refusing invalid event: ${errors.join('; ')}`);
    return false;
  }
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  return true;
}

function makeVerdict(flags, modelFailed) {
  const result = assess(flags);
  const scam = result.scam || modelFailed;
  if (scam) {
    return {
      type: 'verdict',
      scam: true,
      confidence: modelFailed ? Math.max(0.5, result.score / 100) : Math.min(1, Math.max(0.5, result.score / 100)),
      headline: modelFailed
        ? 'Analysis was interrupted — treat this call as suspicious'
        : 'This call shows strong scam indicators',
      advice: ['Hang up', 'Call 1930 cybercrime helpline'],
    };
  }
  return {
    type: 'verdict',
    scam: false,
    confidence: Math.max(0, Math.min(1, result.score / 100)),
    headline: 'No strong scam indicators detected',
    advice: ['Stay cautious and verify callers through official channels'],
  };
}

function setupConnection(ws, { llm, llmFactory }) {
  const session = {
    flags: [],
    transcript: '',
    startedAt: Date.now(),
    lastTMs: 0,
    llmBusy: false,
    llmDirty: false,
    llmPromise: null,
    modelFailed: false,
    ended: false,
  };

  const emitRisk = () => {
    const { score } = assess(session.flags);
    sendEvent(ws, { type: 'risk', score, band: bandFor(score) });
  };

  const runLLM = async () => {
    if (session.llmBusy || session.ended) return session.llmPromise;
    session.llmBusy = true;
    session.llmPromise = (async () => {
      try {
        loadEnv();
        const model = llm ?? llmFactory?.() ?? makeLLM();
        // A chunk arriving during the request only sets llmDirty. The next
        // iteration sees the newest rolling window, so chunks are coalesced.
        while (session.llmDirty) {
          session.llmDirty = false;
          const window = session.transcript.slice(-WINDOW_CHARS);
          try {
            const result = await llmDetect(model, window, {
              tMs: session.lastTMs,
              signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
            });
            const before = new Set(session.flags.filter((f) => f.tier === 2).map((f) => f.technique));
            session.flags = mergeFlags(session.flags, result.flags);
            for (const flag of session.flags) {
              if (flag.tier === 2 && !before.has(flag.technique)) sendEvent(ws, { type: 'flag', flag });
            }
            emitRisk();
          } catch (error) {
            session.modelFailed = true;
            sendEvent(ws, { type: 'error', message: `LLM detection failed: ${error?.message || 'unknown error'}` });
          }
        }
      } catch (error) {
        session.modelFailed = true;
        sendEvent(ws, { type: 'error', message: `LLM setup failed: ${error?.message || 'unknown error'}` });
      } finally {
        session.llmBusy = false;
        session.llmPromise = null;
      }
    })();
    return session.llmPromise;
  };

  const handleChunk = ({ text, tMs }) => {
    if (typeof text !== 'string' || !text.trim() || session.ended) return;
    const at = validTime(tMs, session.lastTMs);
    session.lastTMs = at;
    session.transcript += `${session.transcript ? '\n' : ''}${text}`;
    sendEvent(ws, { type: 'transcript', text, tMs: at, final: false });

    const existingTechniques = new Set(session.flags.map((f) => f.technique));
    const instant = markerScan(text, at);
    for (const flag of instant) {
      if (!existingTechniques.has(flag.technique)) {
        session.flags = mergeFlags(session.flags, [flag]);
        sendEvent(ws, { type: 'flag', flag });
      }
    }
    emitRisk();
    session.llmDirty = true;
    void runLLM();
  };

  const handleEnd = async () => {
    if (session.ended) return;
    session.ended = true;
    if (session.llmPromise) await session.llmPromise;
    sendEvent(ws, makeVerdict(session.flags, session.modelFailed));
  };

  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message?.type === 'chunk') handleChunk(message);
    else if (message?.type === 'end') void handleEnd();
  });
}

export function startServer({ port = process.env.SERVER_PORT || DEFAULT_PORT, llm, llmFactory } = {}) {
  resetIds();
  const httpServer = createHttpServer();
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => setupConnection(ws, { llm, llmFactory }));
  const listening = new Promise((resolve) => httpServer.once('listening', resolve));
  httpServer.listen(Number(port));
  return {
    httpServer,
    wss,
    listening,
    get port() { return httpServer.address()?.port; },
    async close() {
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = startServer();
  await server.listening;
  console.log(`RED FLAG WebSocket server listening on ws://localhost:${server.port}`);
}
