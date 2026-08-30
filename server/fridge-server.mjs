// FridgeSwipe — swipe-to-cook + weekly meal planning from photos of what you actually have.
// Orchestration per slot: web scout → parallel chef personas → deterministic ingredient
// cross-check → deterministic nutrition audit (kcal recomputed from macros) → code ranker
// → swipe deck. Swipes persist to a taste profile that steers every later generation.
// Providers: OpenAI primary when OPENAI_API_KEY is set (model auto-resolved, prefers "luna",
// lowest reasoning effort), Groq gpt-oss-120b/20b (per-model rate buckets), NIM last resort.
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv, makeLLM } from '../src/llm.mjs';

loadEnv();
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const TASTE_FILE = path.join(DATA_DIR, 'fridge-taste.json');
const EATEN_FILE = path.join(DATA_DIR, 'fridge-eaten.json');
mkdirSync(DATA_DIR, { recursive: true });

const PORT = Number(process.env.FRIDGE_PORT ?? 5177);
const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini';
const hasOpenAI = !!process.env.OPENAI_API_KEY;
// GROQ_FAST_MODEL in .env (llama-3.3) 404s on this key; gpt-oss-20b is a separate rate bucket
const FAST_MODEL = 'openai/gpt-oss-20b';

// User directive: OpenAI is primary once its key lands; resolve the cheapest "luna" model.
let openaiModel = (process.env.OPENAI_MODEL || '').trim() || null;
async function resolveOpenAIModel() {
  if (!hasOpenAI) return;
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(8000),
    });
    const ids = (await r.json()).data?.map((m) => m.id) ?? [];
    // user directive: the cheap "luna" tier wins whenever the account has it (stale .env OPENAI_MODEL loses)
    openaiModel = ids.find((i) => i.includes('luna'))
      ?? openaiModel
      ?? ids.filter((i) => /^gpt-5/.test(i) && /nano|mini/.test(i)).sort()[0]
      ?? null;
    console.log('[openai model]', openaiModel ?? 'none matched — tier uses its default');
  } catch (e) { console.error('[openai model resolve failed]', e.message); }
}
resolveOpenAIModel();

const CHAIN = [];
if (hasOpenAI) { try { CHAIN.push(makeLLM({ provider: 'openai' })); } catch {} }
try { CHAIN.push(makeLLM({ provider: 'groq' })); } catch {}
try { CHAIN.push(makeLLM({ provider: 'groq', model: FAST_MODEL })); } catch {}
try { CHAIN.push(makeLLM({ provider: 'nim' })); } catch {}
if (!CHAIN.length) { console.error('need OPENAI_API_KEY, GROQ_API_KEY or NVIDIA_API_KEY in .env'); process.exit(1); }
const firstGroq = CHAIN.find((p) => p.kind === 'groq');

// circuit breaker: a tier that just failed is skipped for 45s so stalls cost 15s once, not every call
const tierDownUntil = new Map();
const tierNoEffort = new Set();

async function llm(args) {
  let lastErr;
  for (let i = 0; i < CHAIN.length; i++) {
    const p = CHAIN[i], isLast = i === CHAIN.length - 1;
    if (!isLast && (tierDownUntil.get(i) ?? 0) > Date.now()) continue;
    // chef-fleet model overrides only apply on the first Groq tier (per-model rate buckets);
    // the OpenAI tier uses the resolved cheap model
    const model = p.kind === 'openai' ? (openaiModel ?? undefined) : (p === firstGroq ? args.model : undefined);
    const effective = String(model ?? p.model);
    // reasoning models: lowest effort so tokens go to recipes, not hidden thinking
    let eff = {};
    if (!tierNoEffort.has(i)) {
      if (effective.includes('gpt-oss') || (p.kind === 'openai' && /^(gpt-5|o\d)/.test(effective))) eff = { reasoning_effort: 'low' };
    }
    // OpenAI (primary, healthy) gets more room; groq tiers stay tight so quota stalls fail fast
    const capMs = isLast ? 60000 : p.kind === 'openai' ? 35000 : 15000;
    const call = (extraEff) => p.complete({
      ...args, model, extra: { ...extraEff, ...(args.extra ?? {}) },
      signal: AbortSignal.timeout(capMs),
    });
    try {
      const out = await call(eff);
      // reasoning models can burn the whole completion budget thinking and return "" — that's a failure
      if (!String(out.text ?? '').trim()) throw new Error('empty content (reasoning ate the token budget)');
      tierDownUntil.delete(i);
      return out;
    } catch (e) {
      if (Object.keys(eff).length && /reasoning|unknown parameter|unsupported/i.test(String(e?.message))) {
        try { const out = await call({}); tierNoEffort.add(i); tierDownUntil.delete(i); return out; } catch (e2) { e = e2; }
      }
      lastErr = e;
      tierDownUntil.set(i, Date.now() + 45000);
      console.error(`[llm ${p.kind} ${effective} failed${isLast ? '' : ' → next'}]`, String(e?.message ?? e).slice(0, 160));
    }
  }
  throw lastErr;
}

// ---------- helpers ----------
function extractJson(text) {
  let t = String(text ?? '').trim().replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  const start = t.search(/[{[]/);
  if (start < 0) throw new Error('no JSON in: ' + t.slice(0, 120));
  // walk to the balanced close so trailing prose doesn't break parsing
  const open = t[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  return JSON.parse(t.slice(start)); // last resort
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/s\b/g, '');
// token-subset matching: "cherry tomatoes"~"tomato" matches, but "egg" does NOT match "eggplant"
function fuzzyFind(name, items) {
  const n = norm(name);
  if (!n) return null;
  const ntoks = new Set(n.split(' '));
  let best = null, bestScore = 0;
  for (const it of items) {
    const m = norm(it.name);
    if (!m) continue;
    const mtoks = new Set(m.split(' '));
    let score = 0;
    if (m === n) score = 3;
    else if ([...ntoks].every((t) => mtoks.has(t)) || [...mtoks].every((t) => ntoks.has(t))) score = 2;
    else {
      const shared = [...ntoks].filter((t) => t.length > 2 && mtoks.has(t));
      if (shared.length) score = 1 + shared.length / Math.max(ntoks.size, 1);
    }
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 1 ? best : null;
}

function loadTaste() {
  try { return JSON.parse(readFileSync(TASTE_FILE, 'utf8')); }
  catch { return { swipes: [], profile: '' }; }
}
function saveTaste(t) { writeFileSync(TASTE_FILE, JSON.stringify(t, null, 2)); }
function loadEaten() {
  try { return JSON.parse(readFileSync(EATEN_FILE, 'utf8')); } catch { return []; }
}

function learnedLine(taste) {
  const liked = taste.swipes.filter((s) => s.dir === 'like');
  const noped = taste.swipes.filter((s) => s.dir === 'nope');
  const count = (arr) => {
    const c = {};
    for (const s of arr) for (const v of [s.cuisine, ...(s.tags ?? [])]) if (v) c[v] = (c[v] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const into = count(liked).slice(0, 3), outof = count(noped).filter((t) => !count(liked).slice(0, 5).includes(t)).slice(0, 2);
  if (!liked.length && !noped.length) return '';
  let s = '';
  if (into.length) s += `you lean ${into.join(', ')}`;
  if (outof.length) s += `${s ? ' · ' : ''}not feeling ${outof.join(', ')}`;
  return s;
}

// ---------- vision ----------
const VISION_PROMPT = `You are a meticulous kitchen inventory scanner. Look at this photo of a fridge, pantry, counter, or groceries.
List EVERY distinct edible item you can identify — read package labels when visible. Estimate quantities honestly.
Do NOT invent items you cannot see. Ignore non-food objects.
Return ONLY JSON: {"items":[{"name":"cherry tomatoes","qty":"~10","unit":"","category":"produce|dairy|protein|grain|spice|condiment|frozen|beverage|snack|other","freshness":"fresh|use-soon|unknown","confidence":0.9}]}`;

// OpenAI when a key is present; else NVIDIA NIM (free tier) — both speak the OpenAI chat API.
function visionProvider() {
  if (process.env.OPENAI_API_KEY) return { base: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY, model: VISION_MODEL, openai: true };
  if (process.env.NVIDIA_API_KEY) return { base: process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1', key: process.env.NVIDIA_API_KEY, model: process.env.NIM_VISION_MODEL ?? 'meta/llama-3.2-11b-vision-instruct', openai: false };
  throw new Error('OPENAI_API_KEY or NVIDIA_API_KEY required for vision');
}

async function visionAnalyze(dataB64, mediaType) {
  const p = visionProvider();
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${p.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: p.model, temperature: 0, max_tokens: 1200,
      ...(p.openai ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'user', content: [
        { type: 'text', text: VISION_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${dataB64}`, ...(p.openai ? { detail: 'high' } : {}) } },
      ] }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`vision ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  const out = extractJson(j.choices?.[0]?.message?.content ?? '{}');
  return (out.items ?? []).filter((i) => i?.name);
}

// ---------- dish images ----------
// One generation per distinct dish, cached to disk; repeats and re-swipes are free.
const IMG_DIR = path.join(DATA_DIR, 'img');
mkdirSync(IMG_DIR, { recursive: true });
const imgInflight = new Map();
const IMG_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
const imgKey = (name) => createHash('sha1').update(norm(name)).digest('hex').slice(0, 16);

async function dishImage(name, cuisine, uses) {
  const key = imgKey(name);
  const file = path.join(IMG_DIR, `${key}.png`);
  if (existsSync(file)) return key;
  if (imgInflight.has(key)) return imgInflight.get(key);
  if (!process.env.OPENAI_API_KEY) throw new Error('no OPENAI_API_KEY for images');

  const prompt = `Overhead editorial food photograph of "${name}"${cuisine ? `, ${cuisine}` : ''}, plated simply on a plain ceramic dish, set on a warm cream paper surface. Ingredients visible: ${(uses ?? []).slice(0, 6).join(', ') || 'seasonal'}. Soft natural window light, muted warm palette, shallow depth of field, minimal props, cookbook styling. No text, no words, no hands, no cutlery clutter.`;

  const p = (async () => {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: IMG_MODEL, prompt, size: '1024x1024', quality: 'low', n: 1 }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`image ${res.status}: ${text.slice(0, 160)}`);
    const j = JSON.parse(text);
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) {
      const url = j.data?.[0]?.url;
      if (!url) throw new Error('image response had no data');
      const bin = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
      writeFileSync(file, bin);
      return key;
    }
    writeFileSync(file, Buffer.from(b64, 'base64'));
    return key;
  })().finally(() => imgInflight.delete(key));

  imgInflight.set(key, p);
  return p;
}

function mergeItems(lists) {
  const merged = [];
  for (const it of lists.flat()) {
    const dup = merged.find((m) => norm(m.name) === norm(it.name));
    if (dup) { if (it.qty && dup.qty && it.qty !== dup.qty) dup.qty = `${dup.qty}+${it.qty}`; }
    else merged.push({ ...it });
  }
  return merged;
}

// ---------- web scout (OpenAI Responses API web_search; optional, cached per meal type) ----------
const scoutCache = new Map();
async function webScout(meal, items) {
  if (!hasOpenAI) return null;
  if (scoutCache.has(meal)) return scoutCache.get(meal);
  const top = items.slice(0, 8).map((i) => i.name).join(', ');
  for (const toolType of ['web_search', 'web_search_preview']) {
    try {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: openaiModel ?? 'gpt-5-mini', tools: [{ type: toolType }], max_output_tokens: 900,
          ...(/^gpt-5|^o\d/.test(openaiModel ?? 'gpt-5') ? { reasoning: { effort: 'low' } } : {}),
          input: `Search the web briefly: 3 popular, well-reviewed ${meal} recipe ideas that mainly use: ${top}. Reply with exactly 3 lines, each "name — one-line hook". No preamble.`,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (/tool|web_search/i.test(j?.error?.message ?? '')) continue;
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      const text = j.output_text
        ?? (j.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n');
      if (text?.trim()) { scoutCache.set(meal, text.trim()); return text.trim(); }
      break;
    } catch (e) { console.error('[scout]', String(e?.message).slice(0, 120)); break; }
  }
  scoutCache.set(meal, null);
  return null;
}

// ---------- chef personas ----------
const CHEFS = [
  { id: 'ghar', emoji: '🇮🇳', name: 'Ghar Ka Khana', style: 'Indian home cooking — dal, sabzi, tadka, roti-rice pairings, desi comfort. Hinglish-friendly names welcome.' },
  { id: 'speed', emoji: '⚡', name: 'Speed Chef', model: FAST_MODEL, style: 'Everything under 20 minutes, one pan if possible, minimal cleanup, maximum flavor-per-minute.' },
  { id: 'comfort', emoji: '🧀', name: 'Comfort Classic', style: 'Hearty, indulgent, crowd-pleasing comfort food from any cuisine. Melty, crispy, saucy.' },
  { id: 'fresh', emoji: '🥗', name: 'Fresh & Light', model: FAST_MODEL, style: 'Bright, produce-forward, balanced plates. Clever with vegetables, lighter proteins, big flavors without heaviness.' },
];
const SLOT_CHEFS = {
  breakfast: [
    { emoji: '🌅', name: 'Desi Nashta', style: 'Indian breakfasts — poha, upma, chilla, paratha, anda dishes. Warm filling starts to the day.' },
    { emoji: '⚡', name: 'Quick Fuel', model: FAST_MODEL, style: 'Under-15-minute breakfasts, protein-forward, minimal cleanup.' },
  ],
  lunch: [
    { emoji: '🇮🇳', name: 'Ghar Ka Khana', style: CHEFS[0].style },
    { emoji: '🥗', name: 'Fresh & Light', model: FAST_MODEL, style: CHEFS[3].style },
  ],
  dinner: [
    { emoji: '🇮🇳', name: 'Ghar Ka Khana', style: CHEFS[0].style },
    { emoji: '🧀', name: 'Comfort Classic', model: FAST_MODEL, style: CHEFS[2].style },
  ],
  snack: [
    { emoji: '☕', name: 'Petit Café', style: 'Light snacks and chai-time bites — 5-10 minutes, fruit-forward or savory nibbles, nothing that dirties three pans.' },
    { emoji: '⚡', name: 'Quick Fuel', model: FAST_MODEL, style: 'Fast protein-forward snacks with minimal cleanup.' },
  ],
};
const KCAL_TARGET = { breakfast: '300-550', lunch: '450-750', dinner: '450-800', snack: '150-350' };
const NUTRI_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'iron_mg', 'sodium_mg', 'vitc_mg'];

const NUTRI_SCHEMA = '"nutrition":{"kcal":420,"protein_g":22,"carbs_g":48,"fat_g":14,"fiber_g":6,"iron_mg":3,"sodium_mg":600,"vitc_mg":20}';
function chefPrompt(chef, items, constraints, tasteProfile) {
  const inv = items.map((i) => `- ${i.name}${i.qty ? ` (${i.qty}${i.unit ? ' ' + i.unit : ''})` : ''}${i.freshness === 'use-soon' ? ' [USE SOON]' : ''}`).join('\n');
  return `You are "${chef.name}": ${chef.style}

THE COOK'S ACTUAL KITCHEN INVENTORY (this is ALL they have, plus water/salt/oil assumed):
${inv}

CONSTRAINTS: max ${constraints.minutes} minutes total, ${constraints.servings} serving(s), diet: ${constraints.diet || 'anything'}.${constraints.mood ? ` Mood/request: "${constraints.mood}".` : ''}
${constraints.restrictions ? `STRICT DIETARY RESTRICTIONS from the cook (never violate): ${constraints.restrictions}` : ''}
${tasteProfile ? `\nTHEIR TASTE PROFILE (learned from their swipes — respect it):\n${tasteProfile}\n` : ''}
Design exactly 2 distinct recipes in your style. Hard rules:
- Build around what they HAVE. Prioritize [USE SOON] items. A recipe may assume at most 1-2 cheap missing staples, flagged honestly in "missing".
- Never list an ingredient in "uses" unless it appears in the inventory above.
- Realistic minutes for a home cook, not a pro.
- "why_you" = one specific sentence tying the dish to THEIR inventory/taste/constraints (not generic marketing).
Return ONLY JSON:
{"recipes":[{"name":"...","cuisine":"...","minutes":25,"difficulty":"easy|medium","servings":2,"why_you":"...","uses":[{"item":"exact inventory name","qty":"2"}],"missing":[{"item":"...","qty":"...","essential":true}],"steps":["short imperative step",...5-8 steps],"tags":["spicy","one-pan",...],${NUTRI_SCHEMA}}]}`;
}

function slotPrompt(chef, items, cons, tasteProfile, meal, day, exclude, scout) {
  const inv = items.map((i) => `- ${i.name}${i.qty ? ` (${i.qty})` : ''}${i.freshness === 'use-soon' ? ' [USE SOON]' : ''}`).join('\n');
  return `You are "${chef.name}": ${chef.style}
You are planning ${meal.toUpperCase()} for day ${day} of a multi-day home meal plan.

INVENTORY (all they have across the whole plan; staples water/salt/oil assumed):
${inv}

CONSTRAINTS: ${cons.servings} serving(s), diet: ${cons.diet || 'anything'}, realistic ${meal} effort, aim ~${KCAL_TARGET[meal] ?? '450-750'} kcal per serving.
${cons.restrictions ? `STRICT DIETARY RESTRICTIONS from the cook (never violate, never suggest workarounds): ${cons.restrictions}` : ''}
${tasteProfile ? `\nTHEIR TASTE PROFILE (learned from swipes — respect it):\n${tasteProfile}\n` : ''}${scout ? `\nWEB SCOUT — popular ideas found online just now (adapt only if they fit the inventory):\n${scout}\n` : ''}
ALREADY PLANNED OR ALREADY REJECTED in this plan (do NOT repeat or closely imitate): ${exclude.join('; ') || 'nothing yet'}

Design exactly 3 DISTINCT ${meal} options. Hard rules:
- Build around what they HAVE; prioritize [USE SOON]. At most 1-2 cheap missing staples per recipe, flagged in "missing".
- Never list an ingredient in "uses" unless it appears in the inventory above.
- "why_you" = one specific sentence tying the dish to THEIR inventory/taste (not marketing).
- "nutrition" = honest per-serving estimates.
Return ONLY JSON:
{"recipes":[{"name":"...","cuisine":"...","minutes":20,"difficulty":"easy","servings":${cons.servings},"why_you":"...","uses":[{"item":"exact inventory name","qty":"1"}],"missing":[{"item":"...","qty":"...","essential":false}],"steps":["4-7 short imperative steps"],"tags":["..."],${NUTRI_SCHEMA}}]}`;
}

const VERIFIER_PROMPT = (items, recipes, constraints) => `You are a ruthless recipe fact-checker. A cook has ONLY this inventory (plus water/salt/basic oil):
${items.map((i) => `- ${i.name}${i.qty ? ` (${i.qty})` : ''}`).join('\n')}

Candidate recipes (JSON): ${JSON.stringify(recipes.map((r) => ({ name: r.name, cuisine: r.cuisine, minutes: r.minutes, uses: r.uses, missing: r.missing, steps: r.steps })))}

For EACH recipe judge harshly:
1. feasibility 0-10: can it truly be made from this inventory? Penalize hidden ingredients implied by steps but absent from inventory AND from "missing".
2. honest_minutes: realistic total time for an average home cook.
3. taste 0-10: how appealing/coherent is the dish itself.
4. keep: false if it needs >2 missing items, any essential missing item that ruins it, exceeds ${constraints.minutes} min by >50%, or violates diet "${constraints.diet || 'none'}".
5. kill_reason: if killed, one blunt sentence (e.g. "needs cream — you have none").
Return ONLY JSON: {"verdicts":[{"name":"...","feasibility":8,"honest_minutes":25,"taste":7,"keep":true,"kill_reason":""}]}`;

// deterministic cross-check: every "uses" item must fuzzy-match real inventory
function crossCheck(recipe, items) {
  const uses = [], moved = [];
  for (const u of recipe.uses ?? []) {
    const hit = fuzzyFind(u.item, items);
    if (hit) uses.push({ ...u, item: hit.name });
    else moved.push(u.item);
  }
  const missing = [...(recipe.missing ?? [])];
  for (const m of moved) if (!missing.some((x) => norm(x.item) === norm(m))) missing.push({ item: m, qty: '', essential: true });
  return { ...recipe, uses, missing, _moved: moved };
}

// deterministic nutrition audit: kcal must agree with 4P+4C+9F within 20%, else corrected in code
function auditNutrition(recipes) {
  let corrected = 0;
  for (const r of recipes) {
    const n = r.nutrition ?? {};
    const p = +n.protein_g || 0, c = +n.carbs_g || 0, f = +n.fat_g || 0;
    const calc = Math.round(4 * (p + c) + 9 * f);
    let kcal = Math.round(+n.kcal || 0);
    if (calc > 0 && (!kcal || Math.abs(kcal - calc) / Math.max(kcal, calc) > 0.2)) { kcal = calc; r._nutriFixed = true; corrected++; }
    r.nutrition = {
      kcal, protein_g: p, carbs_g: c, fat_g: f,
      fiber_g: +n.fiber_g || 0, iron_mg: +n.iron_mg || 0, sodium_mg: +n.sodium_mg || 0, vitc_mg: +n.vitc_mg || 0,
    };
  }
  return corrected;
}

async function maybeDistillProfile(taste, send) {
  if (taste.swipes.length < 3) return;
  send({ type: 'stage', id: 'profile', label: 'Reading your swipe history…' });
  try {
    const r = await llm({
      system: 'You distill food preferences from swipe data. Be specific, not generic.',
      prompt: `Swipe history (like = wants to cook, nope = rejected):\n${JSON.stringify(taste.swipes.slice(-40))}\n\nReturn ONLY JSON {"profile":"2-3 sentences on what this person craves and avoids — cuisines, textures, spice, effort","one_liner":"casual 6-10 word summary"}`,
      maxTokens: 600, temperature: 0.3,
    });
    const p = extractJson(r.text);
    taste.profile = p.profile ?? taste.profile;
    saveTaste(taste);
    send({ type: 'profile', text: p.one_liner ?? '', ms: r.ms });
  } catch (e) { console.error('profile:', e.message); }
}

// ---------- tonight mode: full 4-chef pipeline ----------
async function runDeck(body, send) {
  const { items, constraints = {} } = body;
  const cons = { minutes: constraints.minutes ?? 30, servings: constraints.servings ?? 2, diet: constraints.diet ?? '', mood: constraints.mood ?? '', restrictions: (constraints.restrictions ?? '').slice(0, 300) };
  const taste = loadTaste();
  const t0 = Date.now();

  await maybeDistillProfile(taste, send);

  send({ type: 'stage', id: 'chefs', label: '4 chefs drafting in parallel…', chefs: CHEFS.map((c) => `${c.emoji} ${c.name}`) });
  const chefResults = await Promise.all(CHEFS.map(async (chef) => {
    try {
      const r = await llm({ system: 'You are a recipe designer who NEVER hallucinates ingredients.', prompt: chefPrompt(chef, items, cons, taste.profile), model: chef.model, maxTokens: 1300, temperature: 0.7 });
      const recipes = (extractJson(r.text).recipes ?? []).map((rec) => ({ ...rec, chef: `${chef.emoji} ${chef.name}` }));
      send({ type: 'candidate', chef: `${chef.emoji} ${chef.name}`, names: recipes.map((x) => x.name), ms: r.ms });
      return recipes;
    } catch (e) {
      send({ type: 'candidate', chef: `${chef.emoji} ${chef.name}`, names: [], error: e.message.slice(0, 80) });
      return [];
    }
  }));
  let candidates = chefResults.flat().filter((r) => r?.name && r.steps?.length);
  if (!candidates.length) { send({ type: 'error', message: 'all chefs failed — try again' }); return; }

  send({ type: 'stage', id: 'xcheck', label: 'Cross-checking every ingredient against your shelf…' });
  candidates = candidates.map((r) => crossCheck(r, items));
  const movedTotal = candidates.reduce((n, r) => n + r._moved.length, 0);
  send({ type: 'xcheck', caught: movedTotal, note: movedTotal ? `caught ${movedTotal} ingredient(s) chefs assumed you had — reclassified as missing` : 'all claimed ingredients verified on your shelf' });
  const nutriFixed = auditNutrition(candidates);
  send({ type: 'nutrition', corrected: nutriFixed, note: nutriFixed ? `corrected ${nutriFixed} kcal count(s) that disagreed with their own macros` : 'macro math checks out (4P+4C+9F)' });

  send({ type: 'stage', id: 'verify', label: 'Adversarial verifier interrogating each recipe…' });
  let verdicts = [];
  try {
    const r = await llm({ system: 'You are a skeptical culinary auditor. Default to doubt.', prompt: VERIFIER_PROMPT(items, candidates, cons), maxTokens: 2000, temperature: 0.1 });
    const vv = extractJson(r.text).verdicts;
    verdicts = Array.isArray(vv) ? vv : [];
    send({ type: 'verify', ms: r.ms, verdicts: verdicts.map((v) => ({ name: v.name, keep: v.keep, reason: v.kill_reason || '', feasibility: v.feasibility })) });
  } catch (e) { console.error('verify:', e.message); }

  send({ type: 'stage', id: 'rank', label: 'Scoring, ranking, enforcing variety…' });
  const scored = candidates.map((r) => {
    const v = verdicts.find((x) => norm(x.name) === norm(r.name)) ?? {};
    const essMissing = (r.missing ?? []).filter((m) => m.essential).length;
    const score = (v.feasibility ?? 5) * 0.5 + (v.taste ?? 5) * 0.5 - essMissing * 2 - (r.missing?.length ?? 0) * 0.5;
    return { ...r, minutes: v.honest_minutes ?? r.minutes, _score: Math.round(score * 10) / 10, _keep: v.keep !== false, _kill: v.kill_reason || '' };
  }).sort((a, b) => b._score - a._score);

  const kept = [], cuisineCount = {};
  for (const r of scored) {
    if (!r._keep) continue;
    const c = norm(r.cuisine);
    if ((cuisineCount[c] ?? 0) >= 2) continue;
    cuisineCount[c] = (cuisineCount[c] ?? 0) + 1;
    kept.push(r);
    if (kept.length >= 6) break;
  }
  for (const r of scored) { if (kept.length >= 3) break; if (!kept.includes(r)) { r._risky = true; kept.push(r); } }
  const killed = scored.filter((r) => !kept.includes(r)).map((r) => ({ name: r.name, reason: r._kill || 'outscored' }));

  send({ type: 'deck', ms: Date.now() - t0, killed, learned: learnedLine(taste), cards: kept.map((r) => toCard(r, null, null)) });
}

function toCard(r, day, meal) {
  return {
    name: r.name, chef: r.chef, cuisine: r.cuisine, minutes: r.minutes, difficulty: r.difficulty,
    servings: r.servings, why_you: r.why_you, uses: r.uses, missing: r.missing,
    steps: r.steps, tags: r.tags ?? [], score: r._score, risky: !!r._risky, nutrition: r.nutrition ?? null,
    ...(day ? { day } : {}), ...(meal ? { meal } : {}),
  };
}

// ---------- weekly mode: one slot at a time (day × meal), 5 options per slot ----------
async function runSlotDeck(body, send) {
  const { items = [], day = 1, meal = 'dinner', picked = [], offered = [], constraints = {} } = body;
  const cons = { servings: constraints.servings ?? 2, diet: constraints.diet ?? '', minutes: constraints.minutes ?? 45, restrictions: (constraints.restrictions ?? '').slice(0, 300) };
  const taste = loadTaste();
  const t0 = Date.now();
  const exclude = [...new Set([...picked, ...offered])];

  // distill once per plan (first slot, nothing picked/offered yet)
  if (!picked.length && !offered.length && day === 1) await maybeDistillProfile(taste, send);

  send({ type: 'stage', id: 'scout', label: `Scouting the web for ${meal} inspiration…` });
  const scout = await webScout(meal, items);
  send({ type: 'scout', note: scout ? `web scout found: ${scout.split('\n')[0].slice(0, 110)}` : 'web scout unavailable — cooking from pure skill' });

  const chefs = SLOT_CHEFS[meal] ?? SLOT_CHEFS.dinner;
  send({ type: 'stage', id: 'chefs', label: `Day ${day} ${meal}: 2 chefs drafting 3 options each…`, chefs: chefs.map((c) => `${c.emoji} ${c.name}`) });
  const results = await Promise.all(chefs.map(async (chef) => {
    const args = { system: 'You are a recipe designer who NEVER hallucinates ingredients and gives honest nutrition estimates.', prompt: slotPrompt(chef, items, cons, taste.profile, meal, day, exclude, scout), maxTokens: 2000, temperature: 0.75 };
    try {
      let r;
      try { r = await llm({ ...args, model: chef.model }); }
      catch { r = await llm(args); } // one retry on whichever tier is healthy
      const recipes = (extractJson(r.text).recipes ?? []).map((rec) => ({ ...rec, chef: `${chef.emoji} ${chef.name}` }));
      send({ type: 'candidate', chef: `${chef.emoji} ${chef.name}`, names: recipes.map((x) => x.name), ms: r.ms });
      return recipes;
    } catch (e) {
      send({ type: 'candidate', chef: `${chef.emoji} ${chef.name}`, names: [], error: e.message.slice(0, 80) });
      return [];
    }
  }));
  let candidates = results.flat().filter((r) => r?.name && r.steps?.length);
  // prefer fresh names, but when the cook has skipped so much that everything collides
  // with the exclusion list, a near-repeat beats an error screen
  const fresh = candidates.filter((r) => !exclude.some((x) => norm(x) === norm(r.name)));
  if (fresh.length) candidates = fresh;
  if (!candidates.length) { console.error('[slotdeck] zero candidates', { day, meal, exclude: exclude.length }); send({ type: 'error', message: 'chefs came up empty — try again' }); return; }

  send({ type: 'stage', id: 'xcheck', label: 'Cross-checking ingredients against your shelf…' });
  candidates = candidates.map((r) => crossCheck(r, items));
  const moved = candidates.reduce((n, r) => n + r._moved.length, 0);
  send({ type: 'xcheck', caught: moved, note: moved ? `caught ${moved} assumed ingredient(s) — reclassified as missing` : 'all claimed ingredients verified on your shelf' });

  const fixed = auditNutrition(candidates);
  send({ type: 'nutrition', corrected: fixed, note: fixed ? `corrected ${fixed} kcal count(s) that disagreed with their own macros` : 'macro math checks out (4P+4C+9F)' });

  // code ranker: availability + taste-tag overlap − missing penalty
  const likedTags = new Set();
  for (const s of taste.swipes.filter((x) => x.dir === 'like')) for (const v of [s.cuisine, ...(s.tags ?? [])]) if (v) likedTags.add(norm(v));
  const scored = candidates.map((r) => {
    const ess = (r.missing ?? []).filter((m) => m.essential).length;
    const overlap = [r.cuisine, ...(r.tags ?? [])].filter((v) => v && likedTags.has(norm(v))).length;
    const score = (r.uses?.length ?? 0) * 0.4 + overlap * 0.6 - ess * 2 - (r.missing?.length ?? 0) * 0.4;
    return { ...r, _score: Math.round(score * 10) / 10 };
  }).sort((a, b) => b._score - a._score);

  send({ type: 'slotdeck', ms: Date.now() - t0, day, meal, learned: learnedLine(taste), cards: scored.slice(0, 5).map((r) => toCard(r, day, meal)) });
}

// ---------- meal plan: deterministic ledger ----------
function buildPlan(liked, items) {
  const ledger = items.map((i) => ({ ...i, usedBy: [] }));
  const shopping = new Map();
  for (const rec of liked) {
    for (const u of rec.uses ?? []) {
      const hit = fuzzyFind(u.item, ledger);
      if (hit) hit.usedBy.push(rec.name);
      else {
        const k = norm(u.item);
        shopping.set(k, { item: u.item, for: [...(shopping.get(k)?.for ?? []), rec.name] });
      }
    }
    for (const m of rec.missing ?? []) {
      const k = norm(m.item);
      shopping.set(k, { item: m.item, qty: m.qty, essential: m.essential, for: [...new Set([...(shopping.get(k)?.for ?? []), rec.name])] });
    }
  }
  const contested = ledger.filter((i) => i.usedBy.length > 1).map((i) => ({ item: i.name, by: i.usedBy }));
  const unused = ledger.filter((i) => !i.usedBy.length && i.freshness === 'use-soon').map((i) => i.name);
  return { shopping: [...shopping.values()], contested, useSoonUnused: unused };
}

const MEAL_ORDER = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
function dayTotals(chosen) {
  const days = {};
  for (const c of chosen) {
    const d = (days[c.day ?? 1] ??= Object.fromEntries([['day', c.day ?? 1], ...NUTRI_KEYS.map((k) => [k, 0])]));
    for (const k of NUTRI_KEYS) d[k] += Math.round(+(c.nutrition?.[k]) || 0);
  }
  return Object.values(days).sort((a, b) => a.day - b.day);
}

// ---------- http ----------
function readBody(req, limit = 30e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const ndjson = (res) => { res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' }); return (obj) => res.write(JSON.stringify(obj) + '\n'); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) console.log(`[req] ${req.method} ${url.pathname} from ${req.socket.remoteAddress}`);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(readFileSync(path.join(ROOT, 'web', 'fridge', 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/download') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-disposition': 'attachment; filename="FridgeSwipe.html"' });
      return res.end(readFileSync(path.join(ROOT, 'web', 'fridge', 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') {
      res.writeHead(200, { 'content-type': 'application/manifest+json' });
      return res.end(JSON.stringify({
        name: 'FridgeSwipe', short_name: 'FridgeSwipe', description: 'Dal frigo alla tavola — swipe your way to a week of meals.',
        start_url: '/', display: 'standalone', background_color: '#F5F1E8', theme_color: '#F5F1E8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      }));
    }
    if (req.method === 'GET' && /^\/(icon-192|icon-512|apple-touch-icon)\.png$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
      return res.end(readFileSync(path.join(ROOT, 'web', 'fridge', url.pathname.slice(1))));
    }
    if (req.method === 'POST' && url.pathname === '/api/dish-image') {
      const { name, cuisine = '', uses = [] } = await readBody(req);
      if (!name) return json(res, 400, { error: 'name required' });
      const key = await dishImage(name, cuisine, (uses ?? []).map((u) => u?.item ?? u).filter(Boolean));
      return json(res, 200, { url: `/img/${key}.png` });
    }
    if (req.method === 'GET' && /^\/img\/[0-9a-f]{16}\.png$/.test(url.pathname)) {
      const file = path.join(IMG_DIR, path.basename(url.pathname));
      if (!existsSync(file)) { res.writeHead(404); return res.end('no image'); }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
      return res.end(readFileSync(file));
    }
    if (req.method === 'GET' && url.pathname === '/api/taste') {
      const t = loadTaste();
      return json(res, 200, { swipes: t.swipes.length, profile: t.profile, learned: learnedLine(t) });
    }
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const { data, mediaType = 'image/jpeg' } = await readBody(req);
      const t0 = Date.now();
      const items = await visionAnalyze(data, mediaType);
      return json(res, 200, { items, ms: Date.now() - t0 });
    }
    if (req.method === 'POST' && url.pathname === '/api/merge') {
      const { lists } = await readBody(req);
      return json(res, 200, { items: mergeItems(lists ?? []) });
    }
    if (req.method === 'POST' && url.pathname === '/api/deck') {
      const body = await readBody(req);
      const send = ndjson(res);
      try { await runDeck(body, send); } catch (e) { send({ type: 'error', message: e.message }); }
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/slotdeck') {
      const body = await readBody(req);
      const send = ndjson(res);
      try { await runSlotDeck(body, send); } catch (e) { send({ type: 'error', message: e.message }); }
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/swipe') {
      const { card, dir } = await readBody(req);
      const taste = loadTaste();
      taste.swipes.push({ name: card?.name, cuisine: card?.cuisine, tags: card?.tags ?? [], chef: card?.chef, meal: card?.meal, dir, ts: new Date().toISOString() });
      saveTaste(taste);
      return json(res, 200, { ok: true, learned: learnedLine(taste), swipes: taste.swipes.length });
    }
    if (req.method === 'POST' && url.pathname === '/api/plan') {
      const { liked = [], items = [] } = await readBody(req);
      const plan = buildPlan(liked, items);
      let tips = [];
      try {
        const r = await llm({
          system: 'You are a practical kitchen strategist.',
          prompt: `Tonight's chosen recipes: ${liked.map((l) => `${l.name} (${l.minutes}min)`).join('; ')}. Shared/contested ingredients: ${JSON.stringify(plan.contested)}. Use-soon items still unused: ${plan.useSoonUnused.join(', ') || 'none'}.\nReturn ONLY JSON {"order":["recipe name in ideal cooking order"],"tips":["max 3 short prep/efficiency tips specific to THESE dishes"]}`,
          maxTokens: 600, temperature: 0.4,
        });
        const p = extractJson(r.text);
        plan.order = p.order ?? []; tips = p.tips ?? [];
      } catch (e) { console.error('plan tips:', e.message); }
      return json(res, 200, { ...plan, tips });
    }
    if (req.method === 'POST' && url.pathname === '/api/planweek') {
      const { chosen = [], items = [] } = await readBody(req);
      const plan = buildPlan(chosen, items);
      plan.dayTotals = dayTotals(chosen);
      plan.order = [...chosen].sort((a, b) => (a.day ?? 1) - (b.day ?? 1) || (MEAL_ORDER[a.meal] ?? 2) - (MEAL_ORDER[b.meal] ?? 2)).map((c) => c.name);
      let tips = [];
      try {
        const r = await llm({
          system: 'You are a practical weekly meal-prep strategist.',
          prompt: `The plan: ${chosen.map((c) => `day ${c.day} ${c.meal}: ${c.name}`).join('; ')}. Contested ingredients: ${JSON.stringify(plan.contested)}. Use-soon unused: ${plan.useSoonUnused.join(', ') || 'none'}.\nReturn ONLY JSON {"tips":["max 4 short batch-prep / ingredient-stretching tips specific to THIS plan"]}`,
          maxTokens: 600, temperature: 0.4,
        });
        tips = extractJson(r.text).tips ?? [];
      } catch (e) { console.error('week tips:', e.message); }
      return json(res, 200, { ...plan, tips });
    }
    if (req.method === 'POST' && url.pathname === '/api/log') {
      const { name, day, meal, action = 'eaten' } = await readBody(req);
      const eaten = loadEaten();
      eaten.push({ name, day, meal, action, ts: new Date().toISOString() });
      writeFileSync(EATEN_FILE, JSON.stringify(eaten, null, 2));
      return json(res, 200, { ok: true, count: eaten.length });
    }
    if (req.method === 'GET' && url.pathname === '/api/log') {
      return json(res, 200, { eaten: loadEaten() });
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error(req.url, e);
    try { json(res, 500, { error: e.message }); } catch {}
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FridgeSwipe on http://localhost:${PORT}${hasOpenAI ? ' (OpenAI primary)' : ' (Groq primary — OPENAI_API_KEY empty)'}`);
  if (process.env.LAN_IP) console.log(`  phone: http://${process.env.LAN_IP}:${PORT}`);
});
