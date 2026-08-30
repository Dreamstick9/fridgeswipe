import { writeFileSync } from 'node:fs';
import { loadEnv, makeLLM } from '../src/llm.mjs';
import { CALLS } from '../redflag/fixtures/calls.mjs';
import { SYSTEM } from '../redflag/detector.mjs';
loadEnv();
const llm = makeLLM();
const cache = {};
for (const c of CALLS) {
  await new Promise((r) => setTimeout(r, 900));
  const r = await llm.complete({ system: SYSTEM, prompt: `TRANSCRIPT:\n${c.text}`, json: true, maxTokens: 2000, temperature: 0, signal: AbortSignal.timeout(45000) });
  cache[c.id] = r.text;
  console.log(`  cached ${c.id} (${r.ms}ms)`);
}
writeFileSync('redflag/fixtures/cache.json', JSON.stringify(cache, null, 2));
console.log(`\n✓ ${Object.keys(cache).length} responses cached — tests now run offline and free`);
