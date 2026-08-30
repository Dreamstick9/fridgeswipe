// RED FLAG — live scam-call forensics.
// Flow: a call arrives → we ask permission to listen → we listen silently →
// at critical risk you choose: let the agent speak, or have it coach you → aftercare.
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, StyleSheet, StatusBar, Platform, Easing,
} from 'react-native';
import DEMO_EVENTS from './demoEvents.json';

let useAudioPlayer = null;
try { ({ useAudioPlayer } = require('expo-audio')); } catch {}

const LAN = '10.10.29.28';
const PORT = 8787;
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
function CallSheet({ onYes, onNo }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start(); }, []);
  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [340, 0] }) }] }]}>
      <View style={styles.sheetGrip} />
      <Text style={styles.sheetKicker}>INCOMING CALL</Text>
      <Text style={styles.sheetNumber}>{CALLER}</Text>
      <Text style={styles.sheetAsk}>Want me to listen in?</Text>
      <Text style={styles.sheetNote}>I stay silent. Nothing is recorded or uploaded.</Text>
      <Pressable onPress={onYes} style={styles.sheetPrimary}><Text style={styles.sheetPrimaryText}>YES, LISTEN</Text></Pressable>
      <Pressable onPress={onNo} style={styles.sheetGhost}><Text style={styles.sheetGhostText}>Not this time</Text></Pressable>
    </Animated.View>
  );
}

export default function App() {
  const [stage, setStage] = useState('idle');   // idle|incoming|listening|choose|speaking|coach|after
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

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const reset = () => { setFlags([]); setLines([]); setRisk({ score: 0, band: 'calm' }); setVerdict(null); setErr(null); };

  const apply = useCallback((ev) => {
    if (ev.type === 'transcript') setLines((l) => [...l.slice(-40), ev]);
    else if (ev.type === 'flag') setFlags((f) => (f.some((x) => x.technique === ev.flag.technique) ? f : [...f, ev.flag]));
    else if (ev.type === 'risk') setRisk({ score: ev.score, band: ev.band });
    else if (ev.type === 'verdict') { setVerdict(ev); setStage(ev.scam ? 'choose' : 'after'); }
    else if (ev.type === 'error') setErr(ev.message);
  }, []);

  const runReplay = () => {
    clearTimers(); reset(); setStage('listening');
    const t0 = DEMO_EVENTS[0]?.tMs ?? 0;
    DEMO_EVENTS.forEach((ev) => timers.current.push(setTimeout(() => apply(ev), Math.max(0, (ev.tMs ?? t0) - t0))));
  };

  const runLive = () => {
    clearTimers(); reset(); setStage('listening');
    try {
      const sock = new WebSocket(`ws://${LAN}:${PORT}`);
      ws.current = sock;
      sock.onmessage = (m) => { try { apply(JSON.parse(m.data)); } catch {} };
      sock.onerror = () => setErr('server unreachable — running offline replay'); 
    } catch { setErr('websocket unavailable'); }
  };

  const hangUp = () => {
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

      <ScrollView ref={scroller} style={styles.feed} contentContainerStyle={styles.feedInner}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>

        {stage === 'idle' && (
          <Animated.View style={{ opacity: fade, paddingTop: 24 }}>
            <Text style={styles.emptyBig}>Watching for calls.</Text>
            <Text style={styles.emptySub}>
              When one arrives I ask before I listen. Then I name the manipulation as it
              happens — and quote their exact words back to you.
            </Text>
            <Text style={styles.emptyHint}>tap to simulate an incoming call</Text>
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
            <Pressable onPress={intervene} style={styles.choiceLoud}>
              <Text style={styles.choiceLoudTitle}>🔊  LET ME SPEAK</Text>
              <Text style={styles.choiceLoudSub}>I cut in on the call and tell them we know</Text>
            </Pressable>
            <Pressable onPress={() => setStage('coach')} style={styles.choiceQuiet}>
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
        <CallSheet onYes={() => (ws.current === null && err === null ? runReplay() : runReplay())} onNo={() => setStage('idle')} />
      ) : (
        <Pressable
          onPress={() => (stage === 'idle' ? setStage('incoming') : hangUp())}
          onLongPress={runLive}
          delayLongPress={600}
          style={({ pressed }) => [styles.button,
            { backgroundColor: stage === 'idle' ? accent : '#16171d', borderColor: stage === 'idle' ? 'transparent' : accent },
            pressed && { opacity: 0.85 }]}
        >
          <Text style={[styles.buttonText, { color: stage === 'idle' ? '#08080b' : accent }]}>
            {stage === 'idle' ? 'SIMULATE CALL' : stage === 'after' ? 'DONE' : 'HANG UP'}
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
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 3 },
});
