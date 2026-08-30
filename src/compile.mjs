// The compiler: idea prompt -> intent -> shared-state schema -> graph spec -> code.
// Each floor is validated before the next is generated. A floor that fails validation
// is re-prompted with its own errors, a bounded number of times, then gives up loudly.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { completeJson } from './transport.mjs';
import { INTENT_SYSTEM, intentPrompt, validateIntent } from './floors/intent.mjs';
import { SCHEMA_SYSTEM, schemaPrompt, validateSchema } from './floors/schema.mjs';
import { SPEC_SYSTEM, specPrompt, specValidator } from './floors/graphspec.mjs';
import { emitCode } from './floors/codegen.mjs';

export class FloorError extends Error {
  constructor(floor, errors, attempts) {
    super(`floor "${floor}" failed validation after ${attempts} attempt(s):\n` + errors.map((e) => `  - ${e}`).join('\n'));
    this.name = 'FloorError';
    this.floor = floor;
    this.errors = errors;
  }
}

async function runFloor({ name, system, prompt, validate, transport, maxRepairs = 2, log }) {
  let attempt = 0;
  let lastErrors = [];
  let current = prompt;
  while (attempt <= maxRepairs) {
    attempt++;
    const { json } = await completeJson(transport, { system, prompt: current, floor: name });
    const errors = validate(json) ?? [];
    if (errors.length === 0) {
      log?.({ floor: name, status: 'ok', attempt });
      return { value: json, attempts: attempt };
    }
    lastErrors = errors;
    log?.({ floor: name, status: 'rejected', attempt, errors });
    current = `${prompt}\n\nYour previous answer was REJECTED by the ${name} floor:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nReturn a corrected JSON object that fixes every point above.`;
  }
  throw new FloorError(name, lastErrors, attempt);
}

export async function compile(idea, { transport, outRoot = 'out', maxRepairs = 2, log } = {}) {
  const t0 = Date.now();

  const intent = await runFloor({
    name: 'intent', system: INTENT_SYSTEM, prompt: intentPrompt(idea),
    validate: validateIntent, transport, maxRepairs, log,
  });

  const schema = await runFloor({
    name: 'schema', system: SCHEMA_SYSTEM, prompt: schemaPrompt(intent.value),
    validate: validateSchema, transport, maxRepairs, log,
  });

  const spec = await runFloor({
    name: 'spec', system: SPEC_SYSTEM, prompt: specPrompt(intent.value, schema.value),
    validate: specValidator, transport, maxRepairs, log,
  });

  const slug = intent.value.name;
  const outDir = join(outRoot, slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'intent.json'), JSON.stringify(intent.value, null, 2));
  writeFileSync(join(outDir, 'schema.json'), JSON.stringify(schema.value, null, 2));

  const files = emitCode(spec.value, outDir);
  // code floor's validator: every emitted module must actually parse
  const bad = [];
  for (const f of files.filter((f) => f.endsWith('.mjs'))) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad.push(`${f}: ${String(e.stderr ?? e.message).split('\n')[0]}`); }
  }
  if (bad.length) throw new FloorError('code', bad, 1);
  log?.({ floor: 'code', status: 'ok', attempt: 1, files: files.length });

  return {
    slug, outDir, files,
    intent: intent.value, schema: schema.value, spec: spec.value,
    attempts: { intent: intent.attempts, schema: schema.attempts, spec: spec.attempts },
    ms: Date.now() - t0,
  };
}
