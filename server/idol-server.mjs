// THE IDOL — dedicated HTTP server. Clean and focused.
//   POST /idol/offering  (audio bytes)  -> { transcript, judgment, audio (base64 mp3) }
//   POST /idol/judge     ({text})        -> judgment JSON
//   POST /idol/speak     ({text})        -> mp3 bytes
//   GET  /health
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/llm.mjs';
loadEnv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
import { transcribe } from './transcribe.mjs';
import { judge, speak } from './idol.mjs';

const PORT = process.env.IDOL_PORT || process.env.SERVER_PORT || 8787;
const startedAt = Date.now();
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); };

function readBody(req, cap = 8_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > cap) { req.destroy(); reject(new Error('body too large')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, app: 'the-idol', uptimeS: Math.floor((Date.now() - startedAt) / 1000) });
    }

    if (req.method === 'POST' && req.url === '/idol/offering') {
      const audio = await readBody(req);
      let transcript = '';
      try { transcript = (await transcribe(audio, { filename: 'offering.m4a' })).trim(); }
      catch (e) { return json(res, 502, { error: `transcribe failed: ${e.message}` }); }
      if (!transcript) return json(res, 200, { transcript: '', judgment: null, error: 'The Idol heard only silence.' });
      const judgment = await judge(transcript);
      let audioB64 = null;
      try { audioB64 = (await speak(judgment.speech)).toString('base64'); } catch { /* voice optional */ }
      return json(res, 200, { transcript, judgment, audio: audioB64 });
    }

    if (req.method === 'POST' && req.url === '/idol/judge') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const judgment = await judge(body.text || '');
      return json(res, 200, { judgment });
    }

    if (req.method === 'POST' && req.url === '/idol/speak') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const mp3 = await speak(body.text || '');
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*' });
      return res.end(mp3);
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e.message).slice(0, 200) });
  }
});

server.listen(Number(PORT), () => console.log(`THE IDOL listening on http://localhost:${PORT}`));
