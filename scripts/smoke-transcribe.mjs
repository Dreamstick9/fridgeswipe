import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { loadEnv } from '../src/llm.mjs';
import { transcribe } from '../server/transcribe.mjs';

loadEnv('.env');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

const sentence = 'This is inspector Kumar from the cyber crime branch';
let workDir;

try {
  workDir = await mkdtemp(join(tmpdir(), 'red-flag-stt-'));
  const aiff = join(workDir, 'in.aiff');
  const wav = join(workDir, 'out.wav');

  await run('say', ['-o', aiff, sentence], workDir);
  await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav], workDir);

  const transcript = await transcribe(await readFile(wav), { filename: 'clip.wav' });
  const normalized = transcript.toLowerCase();
  const passed = normalized.includes('inspector')
    && (normalized.includes('cyber') || normalized.includes('crime'));

  console.log(`Transcript: ${transcript}`);
  console.log(passed ? 'PASS' : 'FAIL');
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (workDir) await rm(workDir, { recursive: true, force: true });
}
