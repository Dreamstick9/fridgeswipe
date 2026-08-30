# RED FLAG — build plan
Live scam-call forensics. Demos 16:30. Plan written 11:45.

## Decisions (locked)

| Question | Decision | Why |
|---|---|---|
| Platform | **Expo / React Native** — Android primary, iOS supported, **web build as failsafe** | One codebase both stores. Our Android phone is the demo device (we control it). Web build = zero-install backup if the phone dies on stage. |
| Speech-to-text | **On-device** (`expo-speech-recognition` → Android SpeechRecognizer / iOS SFSpeechRecognizer). Whisper API only as fallback | Free, real-time, no audio leaves the phone (a privacy story judges will ask about), no rate limit. |
| LLM in dev | **NVIDIA NIM** (`integrate.api.nvidia.com/v1`, OpenAI-compatible) | Free. 40 RPM cap is fine for one phone. Zero risk of burning OpenAI credits during 4 hours of iteration. |
| LLM final | **OpenAI** — flip `LLM_PROVIDER=openai` | One env var. No code change. |
| Graph harness | **Yes — as invisible infrastructure only** | Detection genuinely is fan-out (parallel detectors) → join → verify → route. Gives us free spend caps + parallelism. **The UI never mentions graphs.** |
| Codex CLI | **3 parallel agents in git worktrees** | $100 credits. Isolated modules only, so no file conflicts. |

## The one contract everything is built against (define FIRST)

Freezing this at P0 is what lets UI, server, and detector be built **in parallel**.

```ts
type Flag = {
  id: string;
  technique: 'FAKE_AUTHORITY'|'MANUFACTURED_URGENCY'|'ISOLATION_ORDER'|
             'EXTRACTION'|'THREAT_ESCALATION'|'VERIFICATION_THEATRE';
  label: string;        // "FAKE AUTHORITY"
  quote: string;        // the exact words that triggered it
  tMs: number;          // when in the call
  confidence: number;   // 0..1
};
type Event =
  | { type:'transcript'; tMs:number; text:string; final:boolean }
  | { type:'flag'; flag:Flag }
  | { type:'risk'; score:number; band:'calm'|'caution'|'danger'|'critical' }
  | { type:'verdict'; scam:boolean; confidence:number; headline:string;
      advice:string[]; techniques:string[] }
  | { type:'error'; message:string };
```

## Phases — each ends in a GATE you can run yourself

**P0 · 11:45–12:05 · Rails**
- Load `.env`; provider abstraction `nim | openai` behind one `complete()`.
- Freeze `src/contract.mjs` (types + JSON-schema validators for every Event).
- Verify `codex exec` syntax + auth.
- **GATE** `npm run smoke:llm` → prints a real completion from NIM + the model name.
- **GATE** `npm run test:contract` → malformed events rejected.

**P1 · 12:05–12:30 · Taxonomy + fixtures** ← *Codex Agent B, parallel*
- 6 technique definitions with real linguistic markers (Hinglish + English).
- **10 labeled transcripts**: 6 scam (digital arrest, courier/FedEx, TRAI disconnection, fake KYC, army-officer OLX, investment) + **4 BENIGN CONTROLS** (real bank verification, delivery agent, telecom support, HR call).
- The benign controls are the whole security gate: a detector that flags your actual bank is worse than nothing.
- **GATE** `npm run test:fixtures` → all 10 parse, labels schema-valid.

**P2 · 12:30–13:10 · Detector core** (the heart — most test effort here)
- Sliding-window detector: transcript chunk → `Flag[]`, strict JSON, `extractJson` parsing (never eval).
- **GATE** `npm run test:detect`:
  - recall ≥ 80% of labeled techniques across the 6 scam fixtures
  - **false positives = 0 across all 4 benign fixtures** ← hard fail
  - every flag's `quote` must be a real substring of the transcript (anti-hallucination)
  - runs fully offline against a recorded-response cache → **repeatable, free, 2 seconds**

**P3 · 13:10–13:35 · Graph wiring**
- Reuse the harness: fan-out 3 detectors (authority / urgency / money) → join → `verify` node that suppresses low-confidence + hallucinated flags → router → verdict.
- `maxSpendUsd` from `.env` as a hard bound.
- **GATE** `npm run test:graph` → trace shows fan-out + one suppression loop-back; spend cap halts a runaway.

**P4 · 13:35–14:00 · Streaming server** ← *Codex Agent C, parallel*
- WS on `:8787`. Client sends transcript chunks, server emits `Event`s.
- Keys stay server-side — never in the phone bundle.
- **GATE** `npm run smoke:ws` → headless client replays a fixture, asserts events arrive in order with correct types.

**P5 · 14:00–14:40 · Basic UI (ugly but real)** ← *Codex Agent A, started at P1*
- Expo screen: live transcript, flag list, risk meter, verdict card. No styling yet.
- Driven by **fixture replay**, not the mic — so UI is testable before audio exists.
- **GATE** replay on the physical Android phone shows flags appearing in real time.

**P6 · 14:40–15:05 · Microphone**
- On-device ASR → chunks → WS. Permissions for Android + iOS.
- **GATE** speak a scripted scam line at the phone → correct flag within ~3s.

**P7 · 15:05–15:40 · Minimalist redesign**
- Dark, tense, one screen. Flags stake in with motion. Risk meter drives the whole screen's color temperature. Verdict slams.
- **GATE** side-by-side before/after; readable at 3 m on a projector.

**P8 · 15:40–16:00 · Demo hardening**
- `DEMO_MODE=replay` — plays a recorded call with perfect timing, zero network. **The failsafe.**
- Web build as second failsafe. Shareable verdict card. 1930 helpline CTA.
- **GATE** full rehearsal twice, once with wifi switched off.

**16:00–16:30 · Buffer + pitch rehearsal.**

## Codex CLI plan

```bash
git worktree add ../rf-ui    -b ui      # Agent A: Expo screens + components
git worktree add ../rf-tax   -b tax     # Agent B: taxonomy + 10 fixtures
git worktree add ../rf-ws    -b ws      # Agent C: websocket server + smoke client
```
Each agent gets: the frozen contract, its module boundary, and its GATE command as the
definition of done. **No agent touches `src/` graph internals.** I integrate + review every
merge — no agent self-certifies.

## Security / robustness (non-negotiable)

1. Model output is **parsed, never eval'd** (already true in `src/expr.mjs`).
2. Every flag's quote verified as a literal substring → hallucinated evidence is dropped.
3. Zero false positives on benign fixtures, enforced by test.
4. API keys server-side only; the phone bundle ships no secrets.
5. Hard spend cap via graph `caps.maxSpendUsd`.
6. Model/network failure degrades to "analysis unavailable" — never a crash, never a
   false "you're safe".
7. Nothing recorded is uploaded or persisted beyond the session.

## Rollback rule
Every phase gate is a green test. If a phase goes red for >15 min, we ship the previous
phase's state and cut scope — never debug past a gate into the next phase.
