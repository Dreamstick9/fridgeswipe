const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
const TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(response) {
  const retryAfter = Number(response.headers.get('retry-after'));
  return Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 2_000;
}

export async function transcribe(
  buffer,
  { filename = 'chunk.m4a', apiKey = process.env.GROQ_API_KEY } = {},
) {
  if (!apiKey) throw new Error('transcribe: missing GROQ_API_KEY');

  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    form.append('model', MODEL);
    form.append('language', 'en');
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();

    if (response.status === 200) {
      const result = JSON.parse(body);
      return result.text ?? '';
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 1) {
      throw new Error(`Groq transcription ${response.status}: ${body.slice(0, 200)}`);
    }
    await sleep(retryDelay(response));
  }

  throw new Error('Groq transcription failed');
}
