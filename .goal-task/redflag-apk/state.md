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
- [ ] P4 (during queue) server: llmDetect -> runGraph 4-agent orchestration + 'agent' events
- [ ] P5 tests: call-path with native mocked; smoke:realcall asserts specialist fan-out; suites green
- [ ] P6 build delivered (URL+id here) ; Expo Go fallback re-verified
- [ ] P7 independent review + re-review

## Evidence
(fills as gates pass)

## Retired
.goal-task/graph-harness/state.md (superseded by this file)
