// RED FLAG — live scam-call forensics.
// Flow: a call arrives → we ask permission to listen → we listen silently →
// at critical risk you choose: let the agent speak, or have it coach you → aftercare.
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, StyleSheet, StatusBar, Platform, Easing,
  PermissionsAndroid,
} from 'react-native';
import DEMO_EVENTS from './demoEvents.json';

let useAudioPlayer = null, useAudioRecorder = null, RecordingPresets = null, requestRecordingPermissionsAsync = null;
try { ({ useAudioPlayer, useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } = require('expo-audio')); } catch {}
let Notifications = null, Linking = null;
try { Notifications = require('expo-notifications'); } catch {}
try { Linking = require('expo-linking'); } catch {}
import { shouldAutoArm, notificationFor, agentReducer, AGENT_LABELS } from './callFlow';

const SHOW_VOICE = false;   // ElevenLabs intervention parked for now
const PORT = 8787;
// The analysis server lives on the same machine as Metro — derive its host from
// wherever this bundle was actually loaded, so changing networks needs no code edit.
let LAN = '10.10.29.28';
try {
  const Constants = require('expo-constants').default;
  const hostUri = Constants?.expoConfig?.hostUri ?? Constants?.manifest2?.extra?.expoGo?.debuggerHost ?? '';
  const host = String(hostUri).split(':')[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) LAN = host;
} catch {}
const CALLER = '+91 98214 40071';

const BAND = {
  calm:     { c: '#5b6070', label: 'LISTENING' },
  caution:  { c: '#e5a83b', label: 'SOMETHING IS OFF' },
  danger:   { c: '#ff7a2f', label: 'MANIPULATION DETECTED' },
  critical: { c: '#ff2d2d', label: 'THIS IS A SCAM' },
};
const GLYPH = {
  FAKE_AUTHORITY: '⚠', MANUFACTURED_URGENCY: '⏱', ISOLATION_ORDER: '🔇',
  EXTRACTION: '💸', THREAT_ESCALATION: '⛓', VERIFICATION_THEATRE: '🎭',
};
const SCRIPT = [
  'I am not continuing this call.',
  'I know digital arrest is not a real thing.',
  'I will verify this with my local police station myself.',
  'Do not call this number again.',
];
const AFTERCARE = [
  ['Call 1930', 'National cybercrime helpline — report it while it is fresh'],
  ['Block the number', 'They resell numbers that respond'],
  ['Tell one person', 'Isolation is the weapon. Break it.'],
  ['Check your accounts', 'Only if you shared anything at all'],
];
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function useFade(deps = []) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { a.setValue(0); Animated.timing(a, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, deps);
  return a;
}

function FlagCard({ flag, index }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 420, delay: index * 40, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[styles.card, { opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) }] }]}>
      <View style={styles.cardHead}>
        <Text style={styles.glyph}>{GLYPH[flag.technique] ?? '⚑'}</Text>
        <Text style={styles.cardLabel}>{flag.label ?? flag.technique.replace(/_/g, ' ')}</Text>
        <Text style={styles.cardTime}>{clock(flag.tMs)}</Text>
      </View>
      <Text style={styles.quote}>“{flag.quote}”</Text>
    </Animated.View>
  );
}

function RiskMeter({ score, band }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(w, { toValue: score, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [score]);
  const colour = BAND[band].c;
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterTop}>
        <Text style={[styles.meterScore, { color: colour }]}>{score}</Text>
        <Text style={[styles.meterBand, { color: colour }]}>{BAND[band].label}</Text>
      </View>
      <View style={styles.meterTrack}>
        <Animated.View style={[styles.meterFill, { backgroundColor: colour, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}

/** The slide-up that asks permission. Nothing is heard until this is answered. */
function CallSheet({ onYes, onNo, heard }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start(); }, []);
  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [340, 0] }) }] }]}>
      <View style={styles.sheetGrip} />
      <Text style={styles.sheetKicker}>{heard ? 'CALL DETECTED' : 'INCOMING CALL'}</Text>
      <Text style={styles.sheetNumber}>{heard ? 'I can hear a conversation' : CALLER}</Text>
      {heard ? <Text style={styles.sheetHeard}>“…{heard.slice(-80)}”</Text> : null}
      <Text style={styles.sheetAsk}>Want me to listen in?</Text>
      <Text style={styles.sheetNote}>I stay silent. Nothing is recorded or uploaded.</Text>
      <Pressable onPress={onYes} style={styles.sheetPrimary}><Text style={styles.sheetPrimaryText}>YES, LISTEN</Text></Pressable>
      <Pressable onPress={onNo} style={styles.sheetGhost}><Text style={styles.sheetGhostText}>Not this time</Text></Pressable>
    </Animated.View>
  );
}

export default function App() {
  const [stage, setStage] = useState('idle');   // idle|armed|incoming|listening|choose|speaking|coach|after
  const stageRef = useRef('idle');
  const heardRef = useRef('');
  const [flags, setFlags] = useState([]);
  const [lines, setLines] = useState([]);
  const [risk, setRisk] = useState({ score: 0, band: 'calm' });
  const [verdict, setVerdict] = useState(null);
  const [err, setErr] = useState(null);
  const ws = useRef(null);
  const timers = useRef([]);
  const scroller = useRef(null);
  const fade = useFade([stage]);

  const player = useAudioPlayer ? useAudioPlayer(require('./assets/audio/intervene.mp3')) : null;
  const recorder = useAudioRecorder && RecordingPresets ? useAudioRecorder(RecordingPresets.HIGH_QUALITY) : null;
  const recActive = useRef(false);
  const liveLoop = useRef(false);
  const callT0 = useRef(0);

  // Live microphone: record ~4s chunks, transcribe on the server, feed the same pipeline.
  const micLoop = async (sock) => {
    if (!recorder || !requestRecordingPermissionsAsync) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { setErr('mic permission denied — offline replay'); runReplay(); return; }
    } catch { return; }
    liveLoop.current = true;
    callT0.current = Date.now();
    while (liveLoop.current && sock.readyState <= 1) {
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
        recActive.current = true;
        await new Promise((r) => setTimeout(r, 4000));
        await recorder.stop();
        recActive.current = false;
        const uri = recorder.uri;
        if (!uri || !liveLoop.current) break;
        const audio = await fetch(uri).then((r) => r.blob());
        const res = await fetch(`http://${LAN}:${PORT}/transcribe`, { method: 'POST', body: audio });
        const j = await res.json();
        if (j.text && j.text.trim() && sock.readyState === 1) {
          sock.send(JSON.stringify({ type: 'chunk', text: j.text.trim(), tMs: Date.now() - callT0.current }));
        }
      } catch { await new Promise((r) => setTimeout(r, 1500)); /* one bad chunk never kills the call */ }
    }
  };

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const reset = () => { setFlags([]); setLines([]); setRisk({ score: 0, band: 'calm' }); setVerdict(null); setErr(null); };

  useEffect(() => { stageRef.current = stage; }, [stage]);
  const [agents, setAgents] = useState({});

  // Android runtime permissions the native receiver depends on. Requested SEQUENTIALLY —
  // concurrent permission dialogs get silently auto-denied on Android.
  const [diag, setDiag] = useState({ engine: '…', phone: '…', notif: '…', mic: '…' });

  const refreshDiag = useCallback(async () => {
    const d = { engine: 'native', phone: '?', notif: '?', mic: '?' };
    try {
      const Constants = require('expo-constants').default;
      d.engine = Constants?.executionEnvironment === 'storeClient' ? 'EXPO GO (no call detection!)' : 'native';
    } catch {}
    if (Platform.OS === 'android' && PermissionsAndroid?.check) {
      try { d.phone = (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE)) ? 'ok' : 'DENIED'; } catch {}
      try { d.notif = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS ? ((await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) ? 'ok' : 'DENIED') : 'n/a'; } catch {}
      try { d.mic = (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) ? 'ok' : 'not yet'; } catch {}
    }
    setDiag(d);
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android' && PermissionsAndroid?.request) {
        try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE); } catch {}
        try { if (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch {}
        try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO); } catch {}
      }
      await refreshDiag();
    })();
  }, [refreshDiag]);

  const testAlert = useCallback(() => {
    try {
      Notifications?.scheduleNotificationAsync({
        content: { title: '📞 Incoming call detected', body: 'Want me to listen in? Tap, then put the call on speaker.', sound: 'default' },
        trigger: Platform.OS === 'android' ? { channelId: 'redflag-alerts' } : null,
      }).catch(() => {});
    } catch {}
  }, []);

  // JS-side notifications (flags + verdict). The incoming-call notification itself is
  // posted natively by the Kotlin receiver — it must work with JS asleep.
  useEffect(() => {
    if (!Notifications) return;
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      setTimeout(() => Notifications.requestPermissionsAsync().catch(() => {}), 4000);
      Notifications.setNotificationChannelAsync?.('redflag-alerts', {
        name: 'RED FLAG alerts', importance: Notifications.AndroidImportance?.MAX ?? 5,
        sound: 'default', vibrationPattern: [0, 250, 150, 250],
      }).catch(() => {});
    } catch {}
  }, []);

  // Deep link from the native call receiver: redflag://arm -> arm instantly.
  useEffect(() => {
    if (!Linking) return;
    let sub;
    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        if (shouldAutoArm(initial) && stageRef.current === 'idle') arm();
      } catch {}
      try {
        sub = Linking.addEventListener('url', ({ url }) => {
          if (shouldAutoArm(url) && (stageRef.current === 'idle' || stageRef.current === 'armed')) {
            if (stageRef.current === 'idle') arm();
          }
        });
      } catch {}
    })();
    return () => { try { sub?.remove(); } catch {} };
  }, []);

  const notify = useCallback((ev) => {
    const n = notificationFor(ev);
    if (!n || !Notifications) return;
    try {
      Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body, sound: 'default' },
        trigger: Platform.OS === 'android' ? { channelId: 'redflag-alerts' } : null,
      }).catch(() => {});
    } catch {}
  }, []);

  const apply = useCallback((ev) => {
    if (ev.type === 'transcript') {
      setLines((l) => [...l.slice(-40), ev]);
      // ARMED: the first real words we hear ARE the "incoming call" signal.
      if (stageRef.current === 'armed' && ev.text && ev.text.trim().split(/\s+/).length >= 3) {
        heardRef.current = ev.text;
        setStage('incoming');
      }
    }
    else if (ev.type === 'flag') {
      setFlags((f) => {
        const i = f.findIndex((x) => x.technique === ev.flag.technique);
        if (i === -1) return [...f, ev.flag];
        if ((ev.flag.tier ?? 1) > (f[i].tier ?? 1)) { const g = [...f]; g[i] = ev.flag; return g; }
        return f;
      });
      notify(ev);
    }
    else if (ev.type === 'risk') setRisk({ score: ev.score, band: ev.band });
    else if (ev.type === 'agent') setAgents((a) => agentReducer(a, ev));
    else if (ev.type === 'verdict') { setVerdict(ev); setStage(ev.scam ? 'choose' : 'after'); notify(ev); }
    else if (ev.type === 'error') setErr(ev.message);
  }, [notify]);

  const runReplay = () => {
    clearTimers(); reset(); setStage('listening');
    const t0 = DEMO_EVENTS.find((e) => Number.isFinite(e.tMs))?.tMs ?? 0;
    let last = t0;
    DEMO_EVENTS.forEach((ev) => {
      const at = Number.isFinite(ev.tMs) ? ev.tMs : Number.isFinite(ev.flag?.tMs) ? ev.flag.tMs : last + 400;
      last = Math.max(last, at);
      timers.current.push(setTimeout(() => apply(ev), Math.max(0, at - t0)));
    });
  };

  const arm = () => {
    if (ws.current && ws.current.readyState <= 1) return;   // already armed/listening
    clearTimers(); reset(); setStage('armed');
    try {
      const sock = new WebSocket(`ws://${LAN}:${PORT}`);
      ws.current = sock;
      sock.onmessage = (m) => { try { apply(JSON.parse(m.data)); } catch {} };
      sock.onerror = () => { liveLoop.current = false; setErr('server unreachable — demo replay available via long-press'); setStage('idle'); };
      sock.onopen = () => micLoop(sock);
    } catch { setErr('websocket unavailable'); setStage('idle'); }
  };

  const runLive = () => {
    clearTimers(); reset(); setStage('listening');
    try {
      const sock = new WebSocket(`ws://${LAN}:${PORT}`);
      ws.current = sock;
      sock.onmessage = (m) => { try { apply(JSON.parse(m.data)); } catch {} };
      sock.onerror = () => { liveLoop.current = false; setErr('server unreachable — offline replay'); runReplay(); };
      sock.onopen = () => micLoop(sock);
    } catch { runReplay(); }
  };

  // Answering YES: if we were armed, the pipeline is already running — just reveal it.
  // Otherwise (simulated call) prefer live when the server is up, else offline replay.
  const answerYes = async () => {
    if (ws.current && ws.current.readyState === 1 && liveLoop.current) { setStage('listening'); return; }
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 800);
      const r = await fetch(`http://${LAN}:${PORT}/health`, { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) return runLive();
    } catch {}
    runReplay();
  };

  const answerNo = () => {
    liveLoop.current = false;
    if (recActive.current) { try { recorder?.stop(); } catch {} recActive.current = false; }
    if (ws.current) { try { ws.current.close(); } catch {} ws.current = null; }
    clearTimers(); reset(); setStage('idle');
  };

  const hangUp = () => {
    if (stage === 'armed') { answerNo(); return; }
    // In a live call the first tap asks for the verdict; the socket's verdict event moves the stage on.
    if (stage === 'listening' && ws.current && ws.current.readyState === 1 && liveLoop.current) {
      liveLoop.current = false;
      if (recActive.current) { try { recorder?.stop(); } catch {} recActive.current = false; }
      try { ws.current.send(JSON.stringify({ type: 'end' })); } catch {}
      timers.current.push(setTimeout(() => {
        if (stageRef.current === 'listening' && ws.current) {  // verdict never came — reset
          try { ws.current.close(); } catch {}
          ws.current = null;
          setStage('idle');
        }
      }, 12000));
      return;
    }
    liveLoop.current = false;
    if (recActive.current) { try { recorder?.stop(); } catch {} recActive.current = false; }
    clearTimers();
    if (ws.current) { try { ws.current.close(); } catch {} ws.current = null; }
    setStage('idle'); reset();
  };

  const intervene = () => {
    setStage('speaking');
    try { player?.seekTo(0); player?.play(); } catch {}
    timers.current.push(setTimeout(() => setStage('after'), 14000));
  };

  useEffect(() => () => { clearTimers(); if (ws.current) ws.current.close(); }, []);

  const accent = BAND[risk.band].c;
  const busy = stage === 'listening' || stage === 'choose' || stage === 'speaking';

  return (
    <View style={[styles.root, risk.band === 'critical' && stage !== 'idle' && styles.rootAlarm]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.dot, { backgroundColor: busy ? accent : '#33343d' }]} />
          <Text style={styles.brand}>RED FLAG</Text>
        </View>
        <Text style={styles.tagline}>
          {stage === 'listening' ? 'LISTENING · SILENT'
            : stage === 'speaking' ? 'SPEAKING ON THE CALL'
            : stage === 'coach' ? 'READ THIS ALOUD'
            : stage === 'after' ? 'WHAT TO DO NOW'
            : 'scam-call forensics'}
        </Text>
      </View>

      {busy && <RiskMeter score={risk.score} band={risk.band} />}
      {stage === 'listening' && Object.keys(agents).length > 0 && (
        <View style={styles.agentStrip}>
          {Object.entries(AGENT_LABELS).map(([id, label]) => {
            const a = agents[id];
            const on = a?.status === 'running';
            const done = a?.status === 'done';
            return (
              <View key={id} style={[styles.agentPill, on && styles.agentOn, done && styles.agentDone]}>
                <Text style={[styles.agentText, (on || done) && styles.agentTextOn]}>{label}</Text>
              </View>
            );
          })}
        </View>
      )}

      <ScrollView ref={scroller} style={styles.feed} contentContainerStyle={styles.feedInner}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>

        {stage === 'armed' && (
          <Animated.View style={{ opacity: fade, paddingTop: 24 }}>
            <Text style={styles.emptyBig}>Armed. Waiting for the call.</Text>
            <Text style={styles.emptySub}>
              Answer on speaker and keep this screen open. The moment I hear a
              conversation, I'll ask before I start flagging.
            </Text>
            <Text style={styles.emptyHint}>listening for speech…</Text>
          </Animated.View>
        )}

        {stage === 'idle' && (
          <Animated.View style={{ opacity: fade, paddingTop: 24 }}>
            <Text style={styles.emptyBig}>Watching for calls.</Text>
            <Text style={styles.emptySub}>
              When one arrives I ask before I listen. Then I name the manipulation as it
              happens — and quote their exact words back to you.
            </Text>
            <Text style={styles.emptyHint}>tap ARM before a risky call · long-press for demo replay</Text>
            <View style={styles.diagBox}>
              <Text style={styles.diagLine}>engine {diag.engine}   ·   phone {diag.phone}   ·   alerts {diag.notif}   ·   mic {diag.mic}</Text>
              <Pressable onPress={() => { testAlert(); refreshDiag(); }} hitSlop={10}>
                <Text style={styles.diagBtn}>▶ test the call notification</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {flags.map((f, i) => <FlagCard key={f.id ?? i} flag={f} index={i} />)}

        {stage === 'choose' && verdict && (
          <Animated.View style={{ opacity: fade }}>
            <View style={styles.verdict}>
              <Text style={styles.verdictHead}>{verdict.headline}</Text>
              <Text style={styles.verdictSub}>{verdict.techniques?.length ?? 0} manipulation techniques confirmed</Text>
            </View>
            <Text style={styles.chooseAsk}>How do you want to end this?</Text>
            {SHOW_VOICE && (
              <Pressable onPress={intervene} style={styles.choiceLoud}>
                <Text style={styles.choiceLoudTitle}>🔊  LET ME SPEAK</Text>
                <Text style={styles.choiceLoudSub}>I cut in on the call and tell them we know</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setStage('coach')} style={[styles.choiceQuiet, !SHOW_VOICE && styles.choicePrimary]}>
              <Text style={styles.choiceQuietTitle}>💬  TELL ME WHAT TO SAY</Text>
              <Text style={styles.choiceQuietSub}>I stay silent. You read the words.</Text>
            </Pressable>
          </Animated.View>
        )}

        {stage === 'speaking' && (
          <Animated.View style={{ opacity: fade }}>
            <View style={styles.speaking}>
              <Text style={styles.speakingKicker}>ON THE CALL NOW</Text>
              <Text style={styles.speakingText}>
                “Stop. I am an automated fraud monitor on this line. This is a documented
                digital arrest scam. No agency in India conducts digital arrests. Do not
                transfer any money. Hang up now and call 1930.”
              </Text>
            </View>
            <Pressable onPress={() => setStage('after')} style={styles.choiceQuiet}>
              <Text style={styles.choiceQuietTitle}>They hung up →</Text>
            </Pressable>
          </Animated.View>
        )}

        {stage === 'coach' && (
          <Animated.View style={{ opacity: fade }}>
            <Text style={styles.coachKicker}>SAY THIS, CALMLY</Text>
            {SCRIPT.map((s, i) => (
              <View key={i} style={styles.coachLine}>
                <Text style={styles.coachNum}>{i + 1}</Text>
                <Text style={styles.coachText}>{s}</Text>
              </View>
            ))}
            <Pressable onPress={() => setStage('after')} style={styles.choiceQuiet}>
              <Text style={styles.choiceQuietTitle}>Done — what now? →</Text>
            </Pressable>
          </Animated.View>
        )}

        {stage === 'after' && (
          <Animated.View style={{ opacity: fade }}>
            <Text style={styles.afterHead}>You handled it.</Text>
            {AFTERCARE.map(([t, s], i) => (
              <View key={i} style={styles.afterRow}>
                <Text style={styles.afterTitle}>{t}</Text>
                <Text style={styles.afterSub}>{s}</Text>
              </View>
            ))}
            <View style={styles.helplineBox}>
              <Text style={styles.helpline}>1930</Text>
              <Text style={styles.helplineSub}>national cybercrime helpline</Text>
            </View>
          </Animated.View>
        )}

        {lines.length > 0 && stage === 'listening' && (
          <View style={styles.transcript}>
            {lines.slice(-3).map((l, i, arr) => (
              <Text key={i} style={[styles.line, i === arr.length - 1 && styles.lineNow]}>{l.text}</Text>
            ))}
          </View>
        )}
        {err && <Text style={styles.err}>{err}</Text>}
      </ScrollView>

      {stage === 'incoming' ? (
        <CallSheet onYes={answerYes} onNo={answerNo} heard={heardRef.current} />
      ) : (
        <Pressable
          onPress={() => (stage === 'idle' ? arm() : hangUp())}
          onLongPress={() => (stage === 'idle' ? runReplay() : hangUp())}
          delayLongPress={600}
          style={({ pressed }) => [styles.button,
            { backgroundColor: stage === 'idle' ? accent : '#16171d', borderColor: stage === 'idle' ? 'transparent' : accent },
            pressed && { opacity: 0.85 }]}
        >
          <Text style={[styles.buttonText, { color: stage === 'idle' ? '#08080b' : accent }]}>
            {stage === 'idle' ? 'ARM' : stage === 'armed' ? 'DISARM' : stage === 'listening' ? 'GET VERDICT' : stage === 'after' ? 'DONE' : 'HANG UP'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070a', paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingHorizontal: 20 },
  rootAlarm: { backgroundColor: '#140406' },
  header: { marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  brand: { color: '#f4f4f6', fontSize: 26, fontWeight: '800', letterSpacing: 3 },
  tagline: { color: '#5b6070', fontSize: 11, letterSpacing: 2, marginTop: 4, marginLeft: 18, textTransform: 'uppercase' },

  agentStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  agentPill: { borderWidth: 1, borderColor: '#23252e', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  agentOn: { borderColor: '#e5a83b', backgroundColor: '#1c1608' },
  agentDone: { borderColor: '#2c5f3f', backgroundColor: '#0d1810' },
  agentText: { color: '#4a4d59', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  agentTextOn: { color: '#c9cad4' },
  meterWrap: { marginBottom: 20 },
  meterTop: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  meterScore: { fontSize: 58, fontWeight: '800', letterSpacing: -2 },
  meterBand: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, flex: 1 },
  meterTrack: { height: 5, backgroundColor: '#16171d', borderRadius: 3, overflow: 'hidden', marginTop: 5 },
  meterFill: { height: 5, borderRadius: 3 },

  feed: { flex: 1 },
  feedInner: { paddingBottom: 20 },
  emptyBig: { color: '#e8e8ec', fontSize: 27, fontWeight: '700', lineHeight: 34 },
  emptySub: { color: '#6b7080', fontSize: 15, lineHeight: 23, marginTop: 14 },
  emptyHint: { color: '#3c3e48', fontSize: 12, letterSpacing: 1.4, marginTop: 26, textTransform: 'uppercase' },
  diagBox: { marginTop: 30, borderTopWidth: 1, borderTopColor: '#16171d', paddingTop: 14 },
  diagLine: { color: '#4a4d59', fontSize: 12, lineHeight: 18 },
  diagBtn: { color: '#8a8f9e', fontSize: 13, marginTop: 10, textDecorationLine: 'underline' },

  card: { backgroundColor: '#101117', borderLeftWidth: 3, borderLeftColor: '#ff2d2d', borderRadius: 8, padding: 15, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  glyph: { fontSize: 16 },
  cardLabel: { color: '#ff4d4d', fontSize: 13, fontWeight: '800', letterSpacing: 1.2, flex: 1 },
  cardTime: { color: '#4a4d59', fontSize: 12 },
  quote: { color: '#c9cad4', fontSize: 16, lineHeight: 23, marginTop: 8, fontStyle: 'italic' },

  verdict: { backgroundColor: '#ff2d2d', borderRadius: 12, padding: 20, marginTop: 6 },
  verdictHead: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 29 },
  verdictSub: { color: '#ffd4d4', fontSize: 13, marginTop: 6 },

  chooseAsk: { color: '#8a8f9e', fontSize: 14, marginTop: 24, marginBottom: 12, letterSpacing: 0.3 },
  choiceLoud: { backgroundColor: '#ff2d2d', borderRadius: 12, padding: 18, marginBottom: 11 },
  choiceLoudTitle: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 1 },
  choiceLoudSub: { color: '#ffd4d4', fontSize: 13, marginTop: 5 },
  choiceQuiet: { backgroundColor: '#101117', borderWidth: 1, borderColor: '#23252e', borderRadius: 12, padding: 18, marginBottom: 11 },
  choicePrimary: { backgroundColor: '#ff2d2d', borderColor: '#ff2d2d' },
  choiceQuietTitle: { color: '#e8e8ec', fontSize: 17, fontWeight: '700', letterSpacing: 0.6 },
  choiceQuietSub: { color: '#6b7080', fontSize: 13, marginTop: 5 },

  speaking: { backgroundColor: '#101117', borderLeftWidth: 3, borderLeftColor: '#ff2d2d', borderRadius: 10, padding: 18, marginBottom: 14 },
  speakingKicker: { color: '#ff4d4d', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  speakingText: { color: '#e8e8ec', fontSize: 17, lineHeight: 26, marginTop: 10, fontStyle: 'italic' },

  coachKicker: { color: '#5b6070', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 14, marginTop: 6 },
  coachLine: { flexDirection: 'row', gap: 14, marginBottom: 16, alignItems: 'flex-start' },
  coachNum: { color: '#3c3e48', fontSize: 14, fontWeight: '800', marginTop: 3 },
  coachText: { color: '#e8e8ec', fontSize: 19, lineHeight: 27, flex: 1, fontWeight: '600' },

  afterHead: { color: '#e8e8ec', fontSize: 26, fontWeight: '800', marginTop: 6, marginBottom: 18 },
  afterRow: { borderTopWidth: 1, borderTopColor: '#16171d', paddingVertical: 14 },
  afterTitle: { color: '#f4f4f6', fontSize: 17, fontWeight: '700' },
  afterSub: { color: '#6b7080', fontSize: 14, marginTop: 3, lineHeight: 20 },
  helplineBox: { marginTop: 20, alignItems: 'center', backgroundColor: '#101117', borderRadius: 12, paddingVertical: 22 },
  helpline: { color: '#ff3b30', fontSize: 46, fontWeight: '900', letterSpacing: 2 },
  helplineSub: { color: '#5b6070', fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', marginTop: 2 },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#101117', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: 36, borderTopWidth: 1, borderColor: '#23252e' },
  sheetGrip: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#2b2d36', alignSelf: 'center', marginBottom: 18 },
  sheetKicker: { color: '#5b6070', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  sheetNumber: { color: '#f4f4f6', fontSize: 25, fontWeight: '700', marginTop: 5 },
  sheetAsk: { color: '#e8e8ec', fontSize: 19, marginTop: 18, fontWeight: '600' },
  sheetHeard: { color: '#8a8f9e', fontSize: 14, marginTop: 10, fontStyle: 'italic', lineHeight: 20 },
  sheetNote: { color: '#5b6070', fontSize: 13, marginTop: 6, lineHeight: 19 },
  sheetPrimary: { backgroundColor: '#ff2d2d', borderRadius: 30, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  sheetPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  sheetGhost: { alignItems: 'center', paddingVertical: 14 },
  sheetGhostText: { color: '#5b6070', fontSize: 14 },

  transcript: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#16171d' },
  line: { color: '#33353e', fontSize: 13, lineHeight: 19 },
  lineNow: { color: '#7b8090' },
  err: { color: '#e5a83b', fontSize: 13, marginTop: 12 },

  button: { height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 30, borderWidth: 1.5 },
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 3, userSelect: 'none' },
});
