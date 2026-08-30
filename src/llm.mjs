// Provider abstraction: NIM for dev, OpenAI for final. One switch, no code change.
import { readFileSync } from 'node:fs';

export function loadEnv(path = '.env') {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
  return process.env;
}

const PROVIDERS = {
  groq:   { url: () => process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY',   model: () => process.env.GROQ_MODEL   ?? 'openai/gpt-oss-120b' },
  nim:    { url: () => process.env.NIM_BASE_URL  ?? 'https://integrate.api.nvidia.com/v1', key: 'NVIDIA_API_KEY', model: () => process.env.NIM_MODEL ?? 'openai/gpt-oss-120b' },
  openai: { url: () => 'https://api.openai.com/v1', key: 'OPENAI_API_KEY', model: () => process.env.OPENAI_MODEL ?? 'gpt-4o-mini' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeLLM({ provider = process.env.LLM_PROVIDER ?? 'groq', model } = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`makeLLM: unknown provider "${provider}" (groq|nim|openai)`);
  const baseUrl = cfg.url();
  const apiKey = process.env[cfg.key];
  const defaultModel = model ?? cfg.model();
  if (!apiKey) throw new Error(`makeLLM: missing ${cfg.key} — paste it into .env`);
  let spent = 0;

  return {
    kind: provider, model: defaultModel,
    get spentUsd() { return spent; },
    async complete({ system, prompt, model: override, json = true, maxTokens = 700, temperature = 0.1, signal }) {
      const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
      const body = (useJsonMode) => JSON.stringify({
        model: override ?? defaultModel, messages, temperature, max_tokens: maxTokens,
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      });

      // json_object support varies by provider+model; fall back to plain text (we parse it anyway).
      let useJsonMode = json;
      let lastErr;
      for (let attempt = 0; attempt < 5; attempt++) {
        const t0 = Date.now();
        let res, text;
        try {
          res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST', signal,
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
            body: body(useJsonMode),
          });
          text = await res.text();
        } catch (e) {
          lastErr = e;
          if (e.name === 'TimeoutError' || e.name === 'AbortError') throw e;
          await sleep(400 * 2 ** attempt); continue;
        }

        if (res.ok) {
          const j = JSON.parse(text);
          const usage = j.usage ?? {};
          if (provider === 'openai') spent += (usage.prompt_tokens ?? 0) * 0.15e-6 + (usage.completion_tokens ?? 0) * 0.6e-6;
          return { text: j.choices?.[0]?.message?.content ?? '', ms: Date.now() - t0, tokens: usage.completion_tokens ?? 0 };
        }

        lastErr = new Error(`${provider} ${res.status}: ${text.slice(0, 200)}`);
        if (res.status === 400 && useJsonMode) { useJsonMode = false; continue; }   // model rejects json mode
        if (res.status === 429) {                                                   // rate limited: back off
          const retryAfter = Number(res.headers.get('retry-after')) * 1000;
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20000) : 1500 * 2 ** attempt);
          continue;
        }
        if (res.status >= 500) { await sleep(600 * 2 ** attempt); continue; }
        throw lastErr;
      }
      throw lastErr;
    },
  };
}
