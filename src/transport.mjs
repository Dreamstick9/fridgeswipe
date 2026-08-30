// Model transport. Two interchangeable implementations behind one interface so
// every compiler floor and the executor can be validated with or without live
// model access. `complete()` returns { text, json, costUsd }.

const DEFAULT_MODEL = 'claude-opus-5';

/** Pull a JSON value out of a model response that may be fenced or prose-wrapped. */
export function extractJson(text) {
  if (typeof text !== 'string') throw new TypeError('extractJson: expected string');
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n?```/);
  const body = fenced ? fenced[1] : text;
  const trimmed = body.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the outermost balanced {...} or [...] span.
    const start = trimmed.search(/[[{]/);
    if (start === -1) throw new SyntaxError(`no JSON found in response: ${preview(text)}`);
    const open = trimmed[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === open) depth++;
      else if (c === close && --depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1));
      }
    }
    throw new SyntaxError(`unbalanced JSON in response: ${preview(text)}`);
  }
}

const preview = (s) => (s.length > 200 ? `${s.slice(0, 200)}…` : s);

/** Live transport: rides the ambient Claude Code login via the Agent SDK. */
export function liveTransport({ model = DEFAULT_MODEL } = {}) {
  let spent = 0;
  return {
    kind: 'live',
    model,
    get spentUsd() { return spent; },
    async complete({ system, prompt }) {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      const q = query({
        prompt,
        options: {
          model,
          maxTurns: 1,
          allowedTools: [],
          settingSources: [],
          systemPrompt: system,
        },
      });
      let text = '';
      let costUsd = 0;
      for await (const msg of q) {
        if (msg.type === 'result') {
          if (msg.subtype !== 'success') {
            throw new Error(`transport: query failed (${msg.subtype})`);
          }
          text = msg.result ?? '';
          costUsd = msg.total_cost_usd ?? 0;
        }
      }
      spent += costUsd;
      return { text, costUsd };
    },
  };
}

/**
 * Stub transport: deterministic, offline. Responses are supplied as a map of
 * matcher -> reply so every floor and the executor stay testable without auth.
 */
export function stubTransport({ handlers = [], costPerCall = 0.001 } = {}) {
  let spent = 0;
  let calls = 0;
  return {
    kind: 'stub',
    model: 'stub',
    get spentUsd() { return spent; },
    get callCount() { return calls; },
    async complete({ system, prompt }) {
      calls++;
      for (const h of handlers) {
        const hit = typeof h.match === 'function' ? h.match({ system, prompt }) : h.match.test(prompt);
        if (hit) {
          const out = typeof h.reply === 'function' ? h.reply({ system, prompt, calls }) : h.reply;
          const text = typeof out === 'string' ? out : JSON.stringify(out);
          spent += costPerCall;
          return { text, costUsd: costPerCall };
        }
      }
      throw new Error(`stubTransport: no handler matched prompt: ${preview(prompt)}`);
    },
  };
}

/** Ask a transport for JSON, surfacing parse failures with the floor name attached. */
export async function completeJson(transport, { system, prompt, floor }) {
  const { text, costUsd } = await transport.complete({ system, prompt });
  try {
    return { json: extractJson(text), text, costUsd };
  } catch (err) {
    throw new Error(`${floor}: model did not return valid JSON — ${err.message}`);
  }
}

/** OpenAI-backed transport (hackathon credits). Same interface as liveTransport. */
export function openaiTransport({ model = 'gpt-4o-mini', apiKey = process.env.OPENAI_API_KEY } = {}) {
  if (!apiKey) throw new Error('openaiTransport: OPENAI_API_KEY is not set');
  // rough $/token for cap accounting — caps care about magnitude, not cents
  const PRICE = {
    'gpt-4o':       { in: 2.5e-6,  out: 10e-6 },
    'gpt-4o-mini':  { in: 0.15e-6, out: 0.6e-6 },
  };
  let spent = 0;
  return {
    kind: 'openai',
    model,
    get spentUsd() { return spent; },
    async complete({ system, prompt, model: override, json = false }) {
      const use = override ?? model;
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: use,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = await res.json();
      const u = j.usage ?? {};
      const p = PRICE[use] ?? PRICE['gpt-4o-mini'];
      const costUsd = (u.prompt_tokens ?? 0) * p.in + (u.completion_tokens ?? 0) * p.out;
      spent += costUsd;
      return { text: j.choices?.[0]?.message?.content ?? '', costUsd };
    },
  };
}
