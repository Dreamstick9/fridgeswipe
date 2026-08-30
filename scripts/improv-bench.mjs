// THE GATE: >=80% expected-technique recall on improvised scams, and zero
// false positives on the three realistic benign controls.
import { loadEnv, makeLLM } from '../src/llm.mjs';
import { IMPROV } from '../redflag/fixtures/improv.mjs';
import { llmDetect, markerScan, mergeFlags, assess, resetIds } from '../redflag/detector.mjs';

loadEnv();
const llm = makeLLM();
console.log(`provider=${llm.kind} model=${llm.model}\n`);

let recallHit = 0, recallTot = 0, falsePos = 0, latencies = [], failures = [];

for (const c of IMPROV) {
  resetIds();
  await new Promise((r) => setTimeout(r, 900));
  let r;
  try {
    r = await llmDetect(llm, c.text, { signal: AbortSignal.timeout(45000) });
  } catch (e) {
    failures.push(`${c.id}: ${e.message.slice(0, 80)}`);
    console.log(`${c.id.padEnd(28)} ERROR ${e.message.slice(0, 60)}`);
    continue;
  }
  latencies.push(r.ms);
  if (r.parseFailed) {
    failures.push(`${c.id}: PARSE FAILED — ${r.reason}`);
    console.log(`${c.id.padEnd(28)} ⚠ PARSE FAILED: ${r.reason}`);
  }
  const merged = mergeFlags(markerScan(c.text), r.flags);
  const a = assess(merged);
  const got = new Set(r.flags.map((f) => f.technique));

  if (c.scam) {
    const hit = c.expect.filter((t) => got.has(t));
    const miss = c.expect.filter((t) => !got.has(t));
    recallHit += hit.length;
    recallTot += c.expect.length;
    console.log(`SCAM    ${c.id.padEnd(28)} ${hit.length}/${c.expect.length} techniques  score=${String(a.score).padStart(3)} ${a.band.padEnd(8)} ${r.ms}ms${miss.length ? '  missed: ' + miss.join(',') : ''}`);
    if (!a.scam) failures.push(`${c.id}: scored ${a.score}, below scam threshold`);
  } else {
    falsePos += r.flags.length;
    const bad = r.flags.length > 0;
    console.log(`CONTROL ${c.id.padEnd(28)} ${bad ? '❌ ' + r.flags.length + ' FALSE POSITIVES: ' + r.flags.map((f) => f.technique).join(',') : '✅ clean'}  score=${String(a.score).padStart(3)} ${a.band.padEnd(8)} ${r.ms}ms`);
    if (bad) failures.push(`${c.id}: false positives: ${r.flags.map((f) => f.technique).join(', ')}`);
  }
}

const recallPct = recallTot ? (recallHit / recallTot) * 100 : 0;
const p50 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] ?? 0;
console.log(`\n════════════════════════════════════════`);
console.log(`recall          ${recallHit}/${recallTot}  (${recallPct.toFixed(0)}%)   target ≥80%`);
console.log(`false positives ${falsePos}                target 0`);
console.log(`median latency  ${p50}ms`);
console.log(`════════════════════════════════════════`);
const pass = recallPct >= 80 && falsePos === 0;
console.log(pass ? '✅ GATE PASSED' : '❌ GATE FAILED');
if (failures.length) console.log('\n' + failures.map((f) => '  · ' + f).join('\n'));
process.exit(pass ? 0 : 1);
