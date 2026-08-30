import { liveTransport } from '../src/transport.mjs';
const t = liveTransport();
const started = Date.now();
try {
  const { text, costUsd } = await t.complete({
    system: 'Reply with exactly one JSON object and no prose.',
    prompt: 'Return {"ok":true}',
  });
  console.log(JSON.stringify({
    status: 'LIVE_OK', model: t.model, costUsd,
    ms: Date.now() - started, sample: text.slice(0, 120),
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ status: 'LIVE_FAIL', model: t.model, error: err.message }, null, 2));
  process.exit(3);
}
