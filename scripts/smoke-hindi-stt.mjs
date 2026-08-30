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
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

const sentence = 'मैं सीबीआई अधिकारी बोल रहा हूँ, आपका खाता बंद होगा, ओटीपी बताइए और पैसा सुरक्षित खाते में भेजिए।';
let workDir;

try {
  workDir = await mkdtemp(join(tmpdir(), 'red-flag-hindi-stt-'));
  const aiff = join(workDir, 'hindi.aiff');
  const wav = join(workDir, 'hindi.wav');
  await run('say', ['-v', 'Lekha', '-o', aiff, sentence], workDir);
  await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav], workDir);

  const transcript = await transcribe(await readFile(wav), { filename: 'hindi.wav' });
  const hasDevanagari = /[\u0900-\u097f]/u.test(transcript);
  const roman = /\b(cbi|otp|account|kha?ta|paise?|paisa|bank)\b/i.test(transcript);
  console.log(`Transcript: ${transcript}`);
  if (!transcript.trim() || (!hasDevanagari && !roman)) throw new Error('transcript is empty or not Hindi/recognizable romanization');
  console.log('✅ HINDI STT SMOKE PASSED');
} catch (error) {
  console.error(`❌ HINDI STT SMOKE FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (workDir) await rm(workDir, { recursive: true, force: true });
}
