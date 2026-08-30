// THE GATE: >=75% expected-technique recall across four multilingual scams,
// and zero LLM false positives across two multilingual benign controls.
import { loadEnv, makeLLM } from '../src/llm.mjs';
import { MULTILINGUAL } from '../redflag/fixtures/multilingual.mjs';
import { llmDetect, resetIds } from '../redflag/detector.mjs';

loadEnv();
const llm = makeLLM();
console.log(`provider=${llm.kind} model=${llm.model}\n`);

let recallHit = 0;
let recallTot = 0;
let falsePos = 0;
const latencies = [];
const failures = [];

for (const call of MULTILINGUAL) {
  resetIds();
  await new Promise((resolve) => setTimeout(resolve, 900));
  let result;
  try {
    result = await llmDetect(llm, call.text, { signal: AbortSignal.timeout(45000) });
  } catch (error) {
    failures.push(`${call.id}: ${error.message.slice(0, 100)}`);
    console.log(`${call.id.padEnd(28)} ERROR ${error.message.slice(0, 70)}`);
    continue;
  }

  latencies.push(result.ms);
  if (result.parseFailed) {
    failures.push(`${call.id}: PARSE FAILED — ${result.reason}`);
    console.log(`${call.id.padEnd(28)} ⚠ PARSE FAILED: ${result.reason}`);
  }

  const got = new Set(result.flags.map((flag) => flag.technique));
  if (call.scam) {
    const hit = call.expect.filter((technique) => got.has(technique));
    const miss = call.expect.filter((technique) => !got.has(technique));
    recallHit += hit.length;
    recallTot += call.expect.length;
    console.log(`SCAM    ${call.id.padEnd(28)} ${hit.length}/${call.expect.length} techniques${miss.length ? `  missed: ${miss.join(',')}` : ''}  ${result.ms}ms`);
  } else {
    falsePos += result.flags.length;
    const labels = result.flags.map((flag) => flag.technique).join(', ');
    console.log(`CONTROL ${call.id.padEnd(28)} ${result.flags.length ? `❌ ${result.flags.length} FALSE POSITIVES: ${labels}` : '✅ clean'}  ${result.ms}ms`);
    if (result.flags.length) failures.push(`${call.id}: false positives: ${labels}`);
  }
}

const recallPct = recallTot ? (recallHit / recallTot) * 100 : 0;
const ordered = latencies.slice().sort((a, b) => a - b);
const p50 = ordered[Math.floor(ordered.length / 2)] ?? 0;
console.log('\n════════════════════════════════════════');
console.log(`recall          ${recallHit}/${recallTot}  (${recallPct.toFixed(0)}%)   target ≥75%`);
console.log(`false positives ${falsePos}                target 0`);
console.log(`median latency  ${p50}ms`);
console.log('════════════════════════════════════════');
const passed = recallPct >= 75 && falsePos === 0 && failures.length === 0;
console.log(passed ? '✅ GATE PASSED' : '❌ GATE FAILED');
if (failures.length) console.log(`\n${failures.map((failure) => `  · ${failure}`).join('\n')}`);
process.exit(passed ? 0 : 1);
