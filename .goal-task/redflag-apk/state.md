# redflag-apk — live state (baseline 2026-08-30 13:25 IST)

**Objective:** real APK — background call detection → notification → tap opens listening app;
server runs 4-agent graph; agent/verdict notifications. Demos 16:30.

**EAS:** account dreamsticks-team verified (Owner). No project init yet.
**Approach locked:** expo prebuild (bare android/) + Kotlin BroadcastReceiver posting the
call notification NATIVELY (survives backgrounding; no JS wake needed). Notification tap →
deep link redflag://arm → JS auto-arms. Dev-client APK profile first (JS iterable via metro).

## Phases
- [x] P1 JS: deep-link auto-arm, agent strip, notifications, runtime permissions
- [x] P2 prebuild done; CallReceiver.kt posts natively on RINGING/OFFHOOK, cancels on IDLE; manifest verified
- [x] P3 build submitted: id 96b1a49f-c29d-453c-bae1-206a499a3cd8
      logs: https://expo.dev/accounts/dreamstick/projects/red-flag/builds/96b1a49f-c29d-453c-bae1-206a499a3cd8
- [x] P4 server runs 4-agent graph (live-verified: 3 specialists concurrent, skeptic, judge) + degrade path
- [x] P5 43/43 offline; smoke:realcall PASS w/ fan-out assertion (3 concurrent); callflow tests 5/5
- [x] P6 BUILD FINISHED
      APK: https://expo.dev/artifacts/eas/ZA8ctkHNvQ2YLAT6MjSNWzqOXRpdbpJNMp9C95xCZI4.apk
      build id: 96b1a49f-c29d-453c-bae1-206a499a3cd8 · Expo Go fallback verified (exposdk:54.0.0, bundle 200)
- [~] P7 review round 1 COMPLETE (10 findings; native receiver + deep link judged SHIP).
      All 10 addressed at commit 6cee4a6, incl. the honesty fix: skeptic is now the sole
      grounding authority — adversarial loop-back proven by 2 new tests (persistent
      hallucinator -> bounded halt; self-correcting -> convergence). 44/44 offline;
      smoke:realcall + smoke:ws re-PASS live. Re-review dispatched.

## Evidence
(fills as gates pass)

## Retired
.goal-task/graph-harness/state.md (superseded by this file)
