# RED FLAG — the whole plan, in plain English

**What we're building:** an app that listens to a suspicious phone call and tells you,
*live*, that you're being scammed — naming the exact manipulation trick as it happens.

**Why it matters:** ₹4,057 crore stolen in India in 4 years. ~3 lakh reported cases.
Truecaller tells you *who* is calling. **Nobody tells you what they are doing to you.**

---

# PART 1 — Where we are

| # | Step | What it means | Status |
|---|------|---------------|--------|
| 1 | Keys + providers | Groq (fast) / NVIDIA (free) / OpenAI (final) — swap with one line | ✅ |
| 2 | The contract | One shared definition of a "flag" and an "event" so nothing drifts | ✅ |
| 3 | Scam taxonomy | The 6 tricks every scam call uses | ✅ |
| 4 | 10 test calls | 6 real scam scripts + 4 **honest calls written to look scammy** | ✅ |
| 5 | The detector | Reads a transcript, names the tricks, quotes the proof | ✅ |
| 6 | **Safety gate** | Catches 100% of scams, flags 0% of honest calls | ✅ **PASSED** |
| 7 | Multi-agent graph | 3 specialists in parallel + a skeptic that rejects bad evidence | ✅ |
| 8 | Live server | Streams flags to the phone; /health + keepalive + CORS | ✅ |
| 9 | The app | Call sheet → listen → verdict → intervene/coach → aftercare | ✅ |
| 10 | Microphone | 4s chunks → Groq Whisper → live detection | ✅ wired |
| 11 | Make it beautiful | All 5 screens visually verified, dark forensic design | ✅ |
| 12 | Voice intervention | ElevenLabs "LET ME SPEAK" audio, bundled offline | ✅ |
| 13 | Demo-proof it | Offline replay from real detector output; wifi-off rehearsal | ⏳ last |

**Right now: 38/38 tests passing · 3 Codex agents shipped gated modules · every server route
tested against the real APIs · all 5 app screens walked and screenshotted. ₹0 spent.**

---

# PART 2 — The 6 tricks we detect

| Trick | What it sounds like |
|---|---|
| ⚠ **FAKE AUTHORITY** | "I'm Inspector Kumar, CBI, badge 4471" |
| ⏱ **URGENCY** | "within two hours a warrant will be executed" |
| 🔇 **ISOLATION** | "tell no one, not even your family" ← *the deadliest tell* |
| 💸 **THE ASK** | transfer money, share the OTP, install AnyDesk |
| ⛓ **THREAT** | arrest, frozen accounts, non-bailable |
| 🎭 **FAKE PROOF** | forged warrants, uniforms, letterheads |

---

# PART 3 — How the graph runs multiple agents

This is our engine from this morning. **It never appears in the app** — it's the machinery
underneath. Here is what actually happens to every few seconds of the call:

```
                    ┌─→ AUTHORITY agent ─┐     (fake police, forged proof)
  transcript ──→ dispatch ─→ PRESSURE agent ─┼─→ consolidate ─→ SKEPTIC ─→ bench ─→ VERDICT
                    └─→ MONEY agent ─────┘                          │
                                                                    └── evidence rejected? ⟲ re-run
```

**Why three agents instead of one.** One generalist AI juggling six tricks does each one
badly. So we split it: each specialist owns 1–3 tricks and gets a short, sharp prompt.
They run **at the same time**, so three specialists cost the same wall-clock as one —
we get better accuracy for free.

**The SKEPTIC is the safety catch.** It's read-only — it can judge but never rewrite.
It checks that every accusation is quoted **word-for-word from the actual call**. If the AI
invented evidence, the skeptic throws it out and sends the specialists back for another
pass. That loop is *capped* — it can never run forever.

**Three hard limits, enforced by the engine:**
- max steps — the graph physically cannot loop forever
- max spend — it stops before it can burn our credits
- max retries — one re-run per agent, then it must decide

---

# PART 4 — How we're using Codex ($100 credits)

Codex CLI is logged in and running **two agents in parallel right now**, each in its own
isolated copy of the repo (a git worktree) so they can never overwrite each other:

| Agent | Building | Its own definition of "done" |
|---|---|---|
| 🤖 **Codex WS** | The live server that streams flags to the phone | `npm run smoke:ws` passes |
| 🤖 **Codex UI** | The Expo app screen | `expo export` builds clean |
| 👤 **Me** | Detector, graph, safety tests, integration | 38 tests green |

**The trick that makes this safe:** I froze the *contract* first — the exact shape of a
"flag" and an "event". Both Codex agents build against that same frozen contract, so their
work snaps together without either of them ever seeing the other's files.

**I review and merge everything.** No agent certifies its own work — that's the rule that
stops three AIs confidently shipping three broken things.

---

# PART 5 — The thing I'm proudest of: it does NOT cry wolf

A scam detector that flags your real bank is worse than useless — one false alarm and
people uninstall it.

So **4 of our 10 test calls are honest calls deliberately written to look guilty**: a real
HDFC fraud alert, a real delivery agent, a real police passport check, real telecom support.
They're stuffed with scary words — *account, verify, OTP, police, urgent, frozen*.

> **Result: all 4 honest calls score ZERO. All 6 scams score 34–100. No overlap at all.**

It caught a real bug, too. The first version flagged the *genuine* constable as fake police.
I taught it the actual difference:

> **Real officials don't demand secrecy, money, or haste — and they invite you to verify them.**

Now it stays silent on him. That single fix is the difference between a demo and a product.

**Three more guarantees, each enforced by a test that fails the build:**
1. Every flag must **quote your call word-for-word**. Invented evidence is discarded automatically.
2. The AI's answer is **parsed, never executed** — a malicious transcript can't run code.
3. If the AI fails or the network dies, it says *"analysis unavailable."* It will **never**
   falsely tell you that you're safe.

---

# PART 6 — The demo at 16:30

1. Phone on the table. We play a recorded digital-arrest call.
2. Flags stake in one by one as the scammer talks — the room *watches the trap close*.
3. Risk meter climbs. The screen turns red.
4. **"DIGITAL ARREST SCAM — 96%. This isn't real. Hang up. Call 1930."**
5. Closing line: **"Now install it on your mum's phone."**

**Failsafe:** a replay mode that needs no internet at all, in case the venue wifi dies.
We rehearse twice — once with wifi switched off.

---

# PART 7 — What's left, and what I need from you

**Me, next:** merge both Codex agents → wire the microphone → redesign → harden the demo.

**You, when you can:**
- Get the **OpenAI key** from `press-and-code.lovable.app` (we switch to it at ~15:30 for
  the final run — Groq is doing all the dev work for free until then)
- Tell me: **is your Android phone on the same wifi as this Mac?** If the venue network
  blocks phone↔laptop traffic, I'll switch the app to talk over your phone's hotspot —
  and I'd much rather know that now than at 15:00.
