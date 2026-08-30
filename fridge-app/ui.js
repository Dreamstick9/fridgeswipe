// ui.js — design system: French editorial minimalism.
// Warm paper, near-black ink, one Bordeaux accent, hairline rules, serif display.
// Imports: react + react-native only. No default export.
import { useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export const T = {
  paper: '#F6F2EA', ink: '#171512', muted: '#8A8378', hair: '#E4DDD1',
  accent: '#7C2B23', good: '#4C7A5A', warn: '#A8722C',
  serif: Platform.select({ ios: 'Georgia', android: 'serif' }),
  pad: 24,
};

// ---------- layout ----------

export function Shell({ children, footer }) {
  return (
    <View style={st.shell}>
      <View style={st.shellBody}>{children}</View>
      {footer ? <View style={st.shellFooter}>{footer}</View> : null}
    </View>
  );
}

// ---------- typography ----------

export function H({ children, style }) {
  return <Text style={[st.h, style]}>{children}</Text>;
}

export function Sub({ children, style }) {
  return <Text style={[st.sub, style]}>{children}</Text>;
}

export function Label({ children, style }) {
  return <Text style={[st.label, style]}>{children}</Text>;
}

export function Rule({ style }) {
  return <View style={[st.rule, style]} />;
}

// ---------- buttons ----------

export function Btn({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        st.btn,
        pressed && !disabled && st.pressScale,
        disabled && st.disabled,
      ]}
    >
      <Text style={st.btnTxt}>{label}</Text>
    </Pressable>
  );
}

export function Ghost({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        st.ghost,
        pressed && !disabled && st.pressScale,
        disabled && st.disabled,
      ]}
    >
      <Text style={st.ghostTxt}>{label}</Text>
    </Pressable>
  );
}

// ---------- selection ----------

export function Choice({ label, sub, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [st.choice, pressed && st.pressWash]}
    >
      {selected ? <View style={st.choiceBar} /> : null}
      <View style={st.flex1}>
        <Text style={[st.choiceLabel, selected && { color: T.accent }]}>{label}</Text>
        {sub ? <Text style={st.choiceSub}>{sub}</Text> : null}
      </View>
      {selected ? <Text style={st.choiceTick}>✓</Text> : null}
    </Pressable>
  );
}

// ---------- slider ----------

const THUMB = 26;
const TRACK_H = 48;
const SLIDER_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

export function MSlider({ min, max, value, onChange }) {
  const mn = Number.isFinite(min) ? min : 0;
  const mx = Number.isFinite(max) ? max : mn + 10;
  const val = Math.min(mx, Math.max(mn, Number.isFinite(value) ? value : mn));
  const [w, setW] = useState(0);

  // Latest props readable from inside the once-created responder.
  const live = useRef({ w: 0, startX: 0 }).current;
  live.mn = mn; live.mx = mx; live.value = val; live.onChange = onChange; live.w = w;

  const send = (v) => {
    const c = Math.min(live.mx, Math.max(live.mn, v));
    if (c !== live.value) {
      live.value = c; // dedupe until the controlled prop catches up
      if (typeof live.onChange === 'function') live.onChange(c);
    }
  };
  const valueAt = (x) => {
    const span = Math.max(1, live.w - THUMB);
    const r = Math.min(1, Math.max(0, (x - THUMB / 2) / span));
    return Math.round(live.mn + r * (live.mx - live.mn));
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      live.startX = e.nativeEvent.locationX;
      send(valueAt(live.startX)); // tap-on-track jumps immediately
    },
    onPanResponderMove: (e, g) => send(valueAt(live.startX + g.dx)),
  })).current;

  const ratio = mx > mn ? (val - mn) / (mx - mn) : 0;
  const left = Math.max(0, ratio * Math.max(0, w - THUMB));

  return (
    <View>
      <Text style={st.sliderNum}>{String(val)}</Text>
      <View style={st.sliderRow}>
        <Pressable
          style={({ pressed }) => [st.stepBtn, pressed && st.pressWash]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          onPress={() => send(live.value - 1)}
        >
          <Text style={st.stepTxt}>−</Text>
        </Pressable>
        <View
          style={st.track}
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityValue={{ min: mn, max: mx, now: val }}
          accessibilityActions={SLIDER_ACTIONS}
          onAccessibilityAction={(e) => send(live.value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
          {...pan.panHandlers}
        >
          <View style={st.trackLine} />
          {w > 0 ? <View style={[st.trackFill, { width: left + THUMB / 2 }]} /> : null}
          {w > 0 ? <View style={[st.thumb, { left }]} /> : null}
        </View>
        <Pressable
          style={({ pressed }) => [st.stepBtn, pressed && st.pressWash]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Increase"
          onPress={() => send(live.value + 1)}
        >
          <Text style={st.stepTxt}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- progress ----------

export function Dots({ total, index }) {
  const n = Math.max(0, Math.floor(total) || 0);
  return (
    <View style={st.dots}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[st.dot, i === index && st.dotOn]} />
      ))}
    </View>
  );
}

// ---------- pipeline feed ----------

const FEED_CLS = {
  ok: { color: T.good },
  bad: { color: T.accent },
  dim: { color: T.muted },
  stage: { color: T.ink, fontFamily: T.serif, fontSize: 15, lineHeight: 21 },
};

export function FeedLine({ t, txt, cls }) {
  return (
    <View style={st.feedLn}>
      <Text style={st.feedT}>{t != null ? `${t}s` : ''}</Text>
      <Text style={[st.feedTxt, FEED_CLS[cls]]}>{txt}</Text>
    </View>
  );
}

// ---------- inventory ----------

export function Chip({ label, qty, soon, onPress, onRemove }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.chip, pressed && st.pressWash]}
    >
      {soon ? <View style={st.chipDot} /> : null}
      <Text style={st.chipTxt}>
        {label}
        {qty ? <Text style={st.chipQty}>{'  '}{qty}</Text> : null}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={{ top: 10, bottom: 10, left: 2, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={label != null ? `Remove ${label}` : 'Remove'}
          style={({ pressed }) => [st.chipXBox, pressed && { opacity: 0.5 }]}
        >
          <Text style={st.chipX}>×</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// ---------- verdict ----------

export function Stamp({ kind }) {
  const non = kind === 'non';
  const color = non ? T.accent : T.good;
  return (
    <View style={[st.stamp, { borderColor: color, transform: [{ rotate: non ? '12deg' : '-12deg' }] }]}>
      <Text style={[st.stampTxt, { color }]}>{non ? 'NO' : 'SÌ'}</Text>
    </View>
  );
}

// ---------- styles ----------

const st = StyleSheet.create({
  flex1: { flex: 1 },
  shell: {
    flex: 1,
    backgroundColor: T.paper,
    paddingTop: Platform.OS === 'android' ? 40 : 56,
    paddingHorizontal: T.pad,
    paddingBottom: 20,
  },
  shellBody: { flex: 1 },
  shellFooter: { paddingTop: 16 },

  h: { fontFamily: T.serif, fontSize: 30, lineHeight: 36, color: T.ink, letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontSize: 15, lineHeight: 21, color: T.muted },
  label: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: T.muted, fontWeight: '600' },
  rule: { height: 1, alignSelf: 'stretch', backgroundColor: T.hair },

  btn: { backgroundColor: T.ink, borderRadius: 4, paddingVertical: 16, alignItems: 'center' },
  btnTxt: { color: T.paper, fontSize: 16, fontWeight: '600' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.hair, borderRadius: 4, paddingVertical: 15, alignItems: 'center' },
  ghostTxt: { color: T.ink, fontSize: 16, fontWeight: '600' },
  pressScale: { transform: [{ scale: 0.97 }] },
  pressWash: { backgroundColor: 'rgba(23,21,18,0.05)' },
  disabled: { opacity: 0.35 },

  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingLeft: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.hair,
  },
  choiceBar: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 2, backgroundColor: T.accent },
  choiceLabel: { fontFamily: T.serif, fontSize: 17, color: T.ink },
  choiceSub: { fontSize: 13, lineHeight: 18, color: T.muted, marginTop: 3 },
  choiceTick: { color: T.accent, fontSize: 15, marginLeft: 12 },

  sliderNum: {
    fontFamily: T.serif,
    fontSize: 64,
    lineHeight: 72,
    color: T.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginBottom: 12,
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: TRACK_H, justifyContent: 'center' },
  trackLine: { height: 2, backgroundColor: T.hair },
  trackFill: { position: 'absolute', left: 0, top: TRACK_H / 2 - 1, height: 2, backgroundColor: T.accent },
  thumb: { position: 'absolute', top: (TRACK_H - THUMB) / 2, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: T.ink },
  stepBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: T.hair, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: T.ink, fontSize: 18, lineHeight: 20 },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.hair },
  dotOn: { width: 14, backgroundColor: T.accent },

  feedLn: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: T.hair,
  },
  feedT: { width: 38, color: T.muted, fontSize: 10.5, paddingTop: 2, fontVariant: ['tabular-nums'] },
  feedTxt: { flex: 1, color: T.ink, fontSize: 13.5, lineHeight: 19 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.hair,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent, marginRight: 6 },
  chipTxt: { color: T.ink, fontSize: 13.5 },
  chipQty: { color: T.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  chipXBox: { alignSelf: 'stretch', justifyContent: 'center', paddingLeft: 8, paddingRight: 10, marginVertical: -7, marginRight: -10 },
  chipX: { color: T.muted, fontSize: 15 },

  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  stampTxt: { fontFamily: T.serif, fontSize: 30, letterSpacing: 2 },
});
