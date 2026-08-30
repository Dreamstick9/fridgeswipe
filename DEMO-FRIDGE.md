# FridgeSwipe — Tinder for your dinner, now for your whole week

**Photograph your fridge. Swipe one deck per meal slot until the week is planned. Real web search grounds the ideas, deterministic code audits every claim, and every swipe teaches it your taste.**

---

## 90-second demo script

1. **[0:00] Snap the fridge.** "This is my real fridge." GPT-4o-mini vision reads brand-level labels at temp 0 (`/api/analyze`) — **6–9s per photo, 10–16 items each** on the actual photos. Multi-photo shots merge and dedupe (`/api/merge`).
2. **[0:12] Show the inventory.** "The paneer, the sad spinach flagged *use-soon* — all editable, no hallucinated groceries."
3. **[0:20] Tap "Plan my week."** Wizard: how many days (1–3) × which meals (D / L+D / B+L+D). "6 slots — one swipe-right per slot."
4. **[0:30] Narrate the first slot streaming live** (NDJSON via `POST /api/slotdeck`, ~22s end-to-end):
   - *"Scouting the web…"* — a **real OpenAI web_search call** (Responses API) finds popular recipe ideas for this meal *from my actual ingredients*. Cached per meal type, so day-2 dinner reuses it.
   - *"2 chefs drafting 3 options each…"* — meal-specific personas in parallel: breakfast gets **Desi Nashta + Quick Fuel**, lunch **Ghar Ka Khana + Fresh & Light**, dinner **Ghar Ka Khana + Comfort Classic**. Every card carries per-serving nutrition: kcal, protein, carbs, fat, fiber, iron, sodium, vit C.
   - *"Cross-checking ingredients…"* — **pure code**: token-subset fuzzy matching against the shelf ("egg" no longer matches "eggplant"). Hallucinated items get forcibly reclassified as missing.
   - *"Auditing the nutrition math…"* — **code recomputes kcal = 4P + 4C + 9F** and overwrites any model number that drifts >20%. "The chef said 650; its own macros say 512 — code wins."
   - Code ranker orders the 5 cards by taste-tag overlap with *my* swipe history, minus missing-item penalties.
5. **[0:55] Swipe.** Right-swipe locks that slot's meal and the next slot starts streaming. Skip all 5 and it regenerates with everything offered so far excluded — no repeats across the week.
6. **[1:10] Finish → week plan** (`POST /api/planweek`, <10s): a **deterministic ledger** — shopping list of *only the gaps* (tagged with which recipe needs it), "day 1 and day 3 fight over the last onion" (contested), "the spinach is still unused — it dies tomorrow," per-day macro+micro totals **summed in code**, plus batch-prep tips.
7. **[1:25] Close.** Tap "I ate it" — logged to `data/fridge-eaten.json`. Every swipe persisted to `data/fridge-taste.json`; the next plan opens by distilling them into a taste profile. "It gets me a little more every week."

## Why this is not a GPT wrapper

A wrapper is one prompt in, one answer out. FridgeSwipe is a per-slot pipeline where **the LLMs are workers and the code is the boss** (`server/fridge-server.mjs`):

- **Real web grounding.** Each meal type triggers an actual OpenAI Responses-API `web_search` call scoped to the user's top inventory items — chefs adapt live, popular ideas *only if they fit the shelf*. Not a canned recipe DB, not model vibes.
- **Deterministic verification layer 1 — ingredient cross-check.** Token-subset fuzzy matcher (code, no LLM) verifies every claimed `uses` item against the real inventory; unverifiable ones become `missing: essential`. Models cannot lie their way past it.
- **Deterministic verification layer 2 — nutrition audit.** kcal is recomputed from the model's own macros (4P+4C+9F); >20% drift is corrected in code and flagged. The nutrition judges see is arithmetic, not autocomplete.
- **Heterogeneous multi-model orchestration.** 4-tier fallback: OpenAI `gpt-5.6-luna` (auto-resolved from `/v1/models`, reasoning_effort low) → Groq `gpt-oss-120b` → Groq `gpt-oss-20b` (separate rate bucket) → NVIDIA NIM. Per-tier AbortSignal timeouts (35s / 15s / 15s / 60s), a **45s circuit breaker** that sidelines a failed tier so stalls cost 15s once — not on every call — and **empty-content detection**: a reasoning model that thinks its whole token budget away and returns "" is treated as failed and falls through. Tiers that reject `reasoning_effort` are retried without it and remembered.
- **Persistent taste learning.** Swipes append to `data/fridge-taste.json`; once there are ≥3, plan start distills the last 40 into a profile injected into every chef prompt, and liked cuisine/tags feed the code ranker's overlap score. The demo improves while judges watch.
- **Deterministic week ledger.** Shopping gaps, contested ingredients, unused use-soon items, and per-day nutrition totals are 100% code — the LLM only garnishes with batch-prep tips.
- **Tonight mode keeps the adversarial verifier**: `/api/deck` still runs 4 chefs in parallel plus a skeptical temp-0.1 auditor that rewrites dishonest cook times and kills recipes with blunt reasons.

Failure isn't hand-waved: a dead chef streams its error while the other carries on, a slot chef retries once on whichever tier is healthy, and the scout degrades to "cooking from pure skill" instead of crashing.

## Architecture

```
phone (Expo Go, fridge-app/)  ───────┐
web fallback (web/fridge/, tonight   ┴──► server/fridge-server.mjs  (node, zero frameworks, port 5177)
             mode only)                    ├─ POST /api/analyze   GPT-4o-mini vision → inventory JSON
                                           ├─ POST /api/merge     dedupe multi-photo inventories
                                           ├─ POST /api/slotdeck  per-slot: web scout → 2 chefs×3 →
                                           │                      x-check → nutrition audit → rank (NDJSON)
                                           ├─ POST /api/deck      tonight mode: 4 chefs + verifier (NDJSON)
                                           ├─ POST /api/swipe     persist swipe → data/fridge-taste.json
                                           ├─ POST /api/planweek  deterministic week ledger + dayTotals
                                           ├─ POST /api/plan      tonight-mode ledger
                                           ├─ POST /api/log       "I ate it" → data/fridge-eaten.json
                                           └─ GET  /api/taste     current learned profile

LLM chain: OpenAI gpt-5.6-luna → Groq gpt-oss-120b → Groq gpt-oss-20b → NVIDIA NIM
           (per-tier timeouts · 45s circuit breaker · empty-content fallthrough)
```

Streaming is plain NDJSON over HTTP — one JSON line per event (`stage`, `scout`, `candidate`, `xcheck`, `nutrition`, `slotdeck`), so the phone renders live progress with zero websocket machinery.

## Run it

```bash
node server/fridge-server.mjs        # serves API + web UI on :5177
cd fridge-app && npx expo start --port 8082   # native app
```

- **Phone (native):** open `exp://10.10.29.28:8082` in Expo Go — full wizard flow. Server defaults to `http://10.10.29.28:5177`, configurable in-app.
- **Phone (web fallback):** open `http://10.10.29.28:5177` — tonight mode only.
- Needs `.env` with `OPENAI_API_KEY` (primary: chefs, vision, web scout); `GROQ_API_KEY` / `NVIDIA_API_KEY` optional fallback tiers. Port overridable via `FRIDGE_PORT`.
