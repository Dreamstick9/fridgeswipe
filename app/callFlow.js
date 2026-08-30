// Pure logic for the call flow — kept free of native imports so it is unit-testable
// with the native layer mocked (goal gate: no untested wiring reaches the phone).

/** Should a deep link auto-arm the app? redflag://arm carries the native receiver's signal. */
export function shouldAutoArm(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = url.trim().toLowerCase();
    return u.startsWith('redflag://arm') || u.includes('redflag_auto=1');
  } catch { return false; }
}

/** Post-call report deep link from the native receiver. */
export function shouldShowReport(url) {
  if (typeof url !== 'string') return false;
  return url.trim().toLowerCase().startsWith('redflag://report');
}

/** Map an incoming server event to a notification payload, or null for silence.
 *  Only tier-2 (agent-confirmed) flags and verdicts notify — tier-1 stays on screen. */
export function notificationFor(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.type === 'flag' && ev.flag && ev.flag.tier === 2) {
    return {
      title: `🚩 ${ev.flag.label ?? String(ev.flag.technique).replace(/_/g, ' ')}`,
      body: `“${String(ev.flag.quote).slice(0, 120)}”`,
      priority: 'high',
    };
  }
  if (ev.type === 'verdict') {
    return ev.scam
      ? { title: '🔴 SCAM CONFIRMED', body: `${ev.headline}. Hang up. Call 1930.`, priority: 'max' }
      : { title: 'Call looks clean', body: ev.headline, priority: 'default' };
  }
  if (ev.type === 'agent') {
    // agent progress is UI-only; notifying every agent step would be spam
    return null;
  }
  return null;
}

/** Reduce agent status events into the strip the UI renders. */
export function agentReducer(state, ev) {
  if (!ev || ev.type !== 'agent') return state;
  return { ...state, [ev.agent]: { status: ev.status, ms: ev.ms ?? null } };
}

export const AGENT_LABELS = {
  authority_agent: 'AUTHORITY',
  pressure_agent: 'PRESSURE',
  money_agent: 'MONEY',
  skeptic: 'SKEPTIC',
  ruling: 'JUDGE',
};
