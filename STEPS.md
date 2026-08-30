# RED FLAG — the plan, in plain English

**What we're building:** an app that listens to a suspicious phone call and tells you,
live, that you're being scammed — naming the exact manipulation trick as it happens.

**Why it matters:** ₹4,057 crore stolen in India in 4 years. Truecaller tells you *who's*
calling. Nobody tells you *what they're doing to you.*

---

## Where we are right now  ✅ = done

| # | Step | What it means | Status |
|---|------|---------------|--------|
| 1 | Keys + provider | Groq (fast) / NVIDIA (free) / OpenAI (final) — swap with one line | ✅ |
| 2 | The contract | One shared definition of a "flag" and an "event" so nothing drifts | ✅ |
| 3 | Scam taxonomy | The 6 tricks every scam call uses | ✅ |
| 4 | 10 test calls | 6 real scam scripts + 4 **honest calls that look scammy** | ✅ |
| 5 | The detector | Reads a transcript, names the tricks, quotes the proof | ✅ |
| 6 | **The safety gate** | Catches 100% of scams, flags 0% of honest calls | ✅ **PASSED** |
| 7 | Live server | Streams flags to the phone as the call happens | ⏳ next |
| 8 | Basic app | Ugly but working: transcript, flags, risk meter, verdict | ⏳ |
| 9 | Microphone | Real speech → live detection, on-device | ⏳ |
| 10 | Make it beautiful | Dark, tense, one screen, motion | ⏳ |
| 11 | Demo-proof it | Works with wifi OFF. Rehearse twice | ⏳ |

---

## The 6 tricks we detect

1. **FAKE AUTHORITY** — "I'm Inspector Kumar from CBI, badge 4471"
2. **URGENCY** — "within two hours a warrant will be executed"
3. **ISOLATION** — "tell no one, not even your family" ← the deadliest tell
4. **THE ASK** — transfer money, share OTP, install AnyDesk
5. **THREAT** — arrest, frozen accounts, non-bailable
6. **FAKE PROOF** — forged warrants, uniforms, letterheads

---

## The thing I'm proudest of: it does NOT cry wolf

A scam detector that flags your actual bank is worse than useless — people would
uninstall it after one wrong alarm.

So 4 of our 10 test calls are **honest calls deliberately written to look guilty**:
a real HDFC fraud alert, a real delivery agent, a real police passport check, real
telecom support. They're stuffed with scary words — *account, verify, OTP, police, urgent.*

**Result: all 4 honest calls score ZERO. All 6 scams score 34–100.** No overlap.

It caught a real bug too: the first version flagged the *genuine* constable as fake
police. I taught it the actual difference — **real officials don't demand secrecy,
money, or haste, and they invite you to verify them.** Now it stays silent on him.

Three more guarantees, each enforced by a test that fails the build:
- Every flag must **quote your call word-for-word**. Invented evidence is thrown away.
- The AI's answer is **parsed, never executed**.
- If the AI fails or the network dies, it says *"analysis unavailable"* — it never
  falsely says *"you're safe."*

---

## How the demo goes at 16:30

1. Phone on the table, we play a recorded scam call
2. Flags stake in one by one as the scammer talks — the room *watches* the trap close
3. Risk meter climbs, screen turns red
4. **"DIGITAL ARREST SCAM — 96%. This isn't real. Hang up. Call 1930."**
5. Closing line: **"Now install it on your mum's phone."**

Backup: a recorded replay mode that needs no internet, in case venue wifi dies.

---

## Numbers so far

- **32/32 tests passing**
- **100%** of scam techniques caught (21/21)
- **0** false alarms
- **1.8 seconds** to analyse — fast enough for a live call
- **₹0 spent** — all on free Groq + NVIDIA credits so far
