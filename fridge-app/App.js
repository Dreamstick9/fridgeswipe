// FridgeSwipe — Expo Go client, editorial rebuild. Talks to server/fridge-server.mjs on the LAN.
// Same plumbing as before (XHR NDJSON streaming, PanResponder swipes, refs against stale
// closures) — radically simpler presentation, one question per screen, parallel analyze,
// next-slot prefetch. Bilingual garnish: Italian micro-labels, English body copy.
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Image, Modal, PanResponder, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { T, Shell, H, Sub, Label, Rule, Btn, Ghost, Choice, MSlider, Dots, FeedLine, Chip, Stamp } from './ui';

const DEFAULT_SERVER = 'http://10.10.29.28:5177';

const MEALS_FOR = {
  1: ['dinner'],
  2: ['lunch', 'dinner'],
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'snack', 'dinner'],
  5: ['breakfast', 'snack', 'lunch', 'snack', 'dinner'],
  6: ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack'],
  7: ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack', 'snack'],
};
const MEAL_IT = { breakfast: 'Colazione', lunch: 'Pranzo', dinner: 'Cena', snack: 'Spuntino' };
const CAT_ORDER = ['produce', 'dairy', 'protein', 'grain', 'spice', 'condiment', 'frozen', 'beverage', 'snack', 'other'];
const CAT_IT = {
  produce: 'ORTO', dairy: 'LATTICINI', protein: 'PROTEINE', grain: 'CEREALI', spice: 'SPEZIE',
  condiment: 'CONDIMENTI', frozen: 'SURGELATI', beverage: 'BEVANDE', snack: 'SPUNTINI', other: 'ALTRO',
};
const DAY_OPTS = [
  { label: 'Tonight', sub: '1 day', v: 1 },
  { label: '2 days', v: 2 },
  { label: '3 days', v: 3 },
  { label: '4 days', v: 4 },
  { label: '5 days', v: 5 },
  { label: '6 days', v: 6 },
  { label: 'A full week', sub: '7 days', v: 7 },
];
const DIET_OPTS = [
  { label: 'Vegetarian', sub: 'No meat or fish', v: 'vegetarian' },
  { label: 'Non-vegetarian', sub: 'Everything on the table', v: '' },
  { label: 'Vegan', sub: 'No animal products', v: 'vegan' },
];

const mealsFor = (n) => MEALS_FOR[Math.max(1, Math.min(7, n | 0))] ?? ['dinner'];
const cap = (x) => (x ? String(x)[0].toUpperCase() + String(x).slice(1) : '');
function slotList(days, mealsN) {
  const sl = [];
  for (let d = 1; d <= days; d++) {
    let snacks = 0;
    for (const m of mealsFor(mealsN)) {
      const nth = m === 'snack' ? ++snacks : 0;
      const suffix = nth > 1 ? ` ${nth}` : '';
      sl.push({ day: d, meal: m, en: cap(m) + suffix, it: (MEAL_IT[m] ?? cap(m)) + suffix });
    }
  }
  return sl;
}
const labeledMeals = (n) => slotList(1, n).map((x) => x.en);
// server strings arrive with baked-in emoji — strip anything outside quiet typography
const plain = (x) => String(x ?? '').replace(/[^\x20-\x7E -ɏ‐-‟…]/g, '').replace(/ {2,}/g, ' ').trim();
const fmtK = (n) => (n == null || isNaN(+n) ? '—' : String(Math.round(+n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const sec = (ms) => ((+ms || 0) / 1000).toFixed(1);
const nutriLine = (n) => (n ? `${n.kcal ?? '—'} kcal · P ${n.protein_g ?? '—'} · C ${n.carbs_g ?? '—'} · F ${n.fat_g ?? '—'}` : '—');

async function assetToB64(asset) {
  if (asset.base64) return asset.base64;
  try {
    let FS;
    try { FS = require('expo-file-system/legacy'); } catch { FS = require('expo-file-system'); }
    return await FS.readAsStringAsync(asset.uri, { encoding: 'base64' });
  } catch { return null; }
}

export default function App() {
  const [screen, setScreen] = useState('capture'); // capture analyze inv q1 q2 q3 q4 studio deck week
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [photos, setPhotos] = useState([]);            // {uri, b64}
  const [anaBusy, setAnaBusy] = useState(false);
  const [ana, setAna] = useState({ done: 0, total: 0, names: [], count: 0, fail: 0 });
  const [items, setItems] = useState([]);
  const [editIdx, setEditIdx] = useState(-1);
  const [editVal, setEditVal] = useState('');
  const [addVal, setAddVal] = useState('');
  const [days, setDays] = useState(2);
  const [mealsN, setMealsN] = useState(3);
  const [diet, setDiet] = useState('');
  const [restrict, setRestrict] = useState('');
  const [slots, setSlots] = useState([]);              // [{day, meal, en, it}] day-major
  const [slotIdx, setSlotIdx] = useState(0);
  const [picked, setPicked] = useState([]);            // one locked card per filled slot
  const [feed, setFeed] = useState([]);                // {t, txt, cls} — generation timeline
  const [genErr, setGenErr] = useState(false);
  const [deck, setDeck] = useState([]);
  const [pos, setPos] = useState(0);
  const [peek, setPeek] = useState(false);
  const [weekPlan, setWeekPlan] = useState(null);
  const [profileTxt, setProfileTxt] = useState('');
  const [checked, setChecked] = useState({});

  // refs kept in lockstep with state — swipe/stream callbacks outlive renders
  const serverRef = useRef(server); serverRef.current = server;
  const itemsRef = useRef(items); itemsRef.current = items;
  const slotsRef = useRef(slots); slotsRef.current = slots;
  const slotIdxRef = useRef(slotIdx); slotIdxRef.current = slotIdx;
  const pickedRef = useRef(picked); pickedRef.current = picked;
  const deckRef = useRef(deck); deckRef.current = deck;
  const posRef = useRef(pos); posRef.current = pos;
  const consRef = useRef({ diet: '', restrictions: '' });
  const cacheRef = useRef({});                         // slot idx -> {status, events, deck, names, t0, xhr, dead}
  const watchingRef = useRef(null);                    // slot idx the studio screen is currently showing
  const shownRef = useRef({ idx: -1, names: [] });     // every name shown for the current slot (regeneration)
  const flying = useRef(false);                        // double-swipe guard
  const eatPosted = useRef({});
  const feedScroll = useRef(null);

  const api = (p) => serverRef.current.replace(/\/$/, '') + p;

  // ---------- capture ----------
  async function pickImages(fromCamera) {
    try {
      const opts = { quality: 0.4, base64: true, exif: false };
      let res;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Camera permission needed');
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: 6 });
      }
      if (res.canceled) return;
      const added = [];
      for (const a of res.assets ?? []) {
        const b64 = await assetToB64(a);
        if (b64) added.push({ uri: a.uri, b64 });
      }
      if (added.length) setPhotos((p) => [...p, ...added]);
    } catch (e) { Alert.alert('Picker error', String(e?.message ?? e)); }
  }

  // ---------- analyze: all photos in parallel, merge, straight to inventory ----------
  async function analyze() {
    if (anaBusy || !photos.length) return;
    setAnaBusy(true);
    setScreen('analyze');
    setAna({ done: 0, total: photos.length, names: [], count: 0, fail: 0 });
    const lists = await Promise.all(photos.map(async (p) => {
      try {
        const r = await fetch(api('/api/analyze'), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: p.b64, mediaType: 'image/jpeg' }),
        });
        const j = await r.json();
        if (!j || j.error) throw new Error(j?.error ?? 'analyze failed');
        const found = Array.isArray(j.items) ? j.items.filter((x) => x && x.name) : [];
        setAna((a) => ({ ...a, done: a.done + 1, count: a.count + found.length, names: [...a.names, ...found.map((x) => x.name)].slice(-4) }));
        return found;
      } catch {
        setAna((a) => ({ ...a, done: a.done + 1, fail: a.fail + 1 }));
        return null;
      }
    }));
    const ok = lists.filter(Boolean);
    if (!ok.length) {
      setAnaBusy(false);
      setScreen('capture');
      Alert.alert('Could not read the photos', 'Check the server address at the bottom of the screen, then try again.');
      return;
    }
    let merged = null;
    try {
      const m = await fetch(api('/api/merge'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lists: ok }),
      }).then((r) => r.json());
      if (Array.isArray(m?.items)) merged = m.items;
    } catch {}
    setItems(merged ?? ok.flat());
    setAnaBusy(false);
    setScreen('inv'); // no pause
  }

  // ---------- inventory ----------
  function addItem() {
    const v = addVal.trim();
    if (!v) return;
    setItems((arr) => [...arr, { name: v, category: 'other', freshness: 'unknown' }]);
    setAddVal('');
  }
  const groups = useMemo(() => {
    const m = {};
    items.forEach((it, i) => { const c = it?.category ?? 'other'; (m[c] ??= []).push([it, i]); });
    const keys = [...CAT_ORDER.filter((c) => m[c]), ...Object.keys(m).filter((c) => !CAT_ORDER.includes(c))];
    return keys.map((k) => [k, m[k]]);
  }, [items]);

  // ---------- wizard ----------
  function pickDays(v) {
    setDays(v);
    setMealsN(v === 1 ? 1 : 3);
    setTimeout(() => setScreen('q2'), 180);
  }
  function pickDiet(v) {
    setDiet(v);
    setTimeout(() => setScreen('q4'), 180);
  }
  function startPlanning(raw) {
    if (!itemsRef.current.length) {
      Alert.alert('Your kitchen is empty', 'Add at least one item before planning.');
      return;
    }
    const r = String(raw ?? '').trim();
    consRef.current = { diet, restrictions: r };
    const sl = slotList(days, mealsN);
    if (!sl.length) return;
    for (const k of Object.keys(cacheRef.current)) discardSlotFetch(+k);
    shownRef.current = { idx: -1, names: [] };
    setSlots(sl); slotsRef.current = sl;
    setSlotIdx(0); slotIdxRef.current = 0;
    setPicked([]); pickedRef.current = [];
    setDeck([]); deckRef.current = [];
    setPos(0); posRef.current = 0;
    setWeekPlan(null); setChecked({}); eatPosted.current = {};
    openSlot(0);
  }

  // ---------- slot decks: NDJSON over XHR, cached per slot for prefetch ----------
  function discardSlotFetch(idx) {
    const e = cacheRef.current[idx];
    if (!e) return;
    e.dead = true;
    try { e.xhr && e.xhr.abort(); } catch {}
    delete cacheRef.current[idx];
  }

  function startSlotFetch(idx, offeredList) {
    const slot = slotsRef.current[idx];
    if (!slot) return;
    const entry = { status: 'pending', events: [], deck: null, names: [], t0: Date.now(), xhr: null, dead: false };
    cacheRef.current[idx] = entry;
    const push = (txt, cls = '') => {
      if (entry.dead || !txt) return;
      const line = { t: ((Date.now() - entry.t0) / 1000).toFixed(1), txt, cls };
      entry.events.push(line);
      if (watchingRef.current === idx) setFeed((f) => [...f, line]);
    };
    const handle = (ev) => {
      if (entry.dead || !ev || typeof ev !== 'object') return;
      if (ev.type === 'stage') push([plain(ev.label), Array.isArray(ev.chefs) ? ev.chefs.map(plain).join(' · ') : ''].filter(Boolean).join('\n'), 'stage');
      else if (ev.type === 'profile') push(`Taste memory — ${plain(ev.text)}`, 'ok');
      else if (ev.type === 'scout') push(plain(ev.note), 'dim');
      else if (ev.type === 'candidate') push(ev.error ? `${plain(ev.chef)} came up empty` : `${plain(ev.chef)} — ${(ev.names ?? []).join(' · ')}  (${sec(ev.ms)}s)`, ev.error ? 'bad' : '');
      else if (ev.type === 'xcheck') push(plain(ev.note), ev.caught ? 'bad' : 'ok');
      else if (ev.type === 'nutrition') push(plain(ev.note), ev.corrected ? 'ok' : 'dim');
      else if (ev.type === 'error') push(plain(ev.message) || 'Something failed in the kitchen.', 'bad');
      else if (ev.type === 'slotdeck') {
        const cards = Array.isArray(ev.cards) ? ev.cards.filter((c) => c && c.name) : [];
        entry.deck = cards;
        entry.names = cards.map((c) => c.name);
        entry.status = cards.length ? 'done' : 'error';
        push(cards.length ? `${cards.length} ideas on the table.` : 'Nothing survived the audit.', cards.length ? 'stage' : 'bad');
        if (watchingRef.current === idx) {
          if (cards.length) presentDeck(idx, cards);
          else setGenErr(true);
        }
      }
    };
    const xhr = new XMLHttpRequest();
    entry.xhr = xhr;
    let seen = 0;
    xhr.open('POST', api('/api/slotdeck'));
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3) {
        const chunk = xhr.responseText.slice(seen);
        const nl = chunk.lastIndexOf('\n');
        if (nl >= 0) {
          seen += nl + 1;
          for (const l of chunk.slice(0, nl).split('\n')) if (l.trim()) { try { handle(JSON.parse(l)); } catch {} }
        }
        if (xhr.readyState === 4 && !entry.dead) {
          if (xhr.status !== 200) {
            entry.status = 'error';
            push(`Server error (HTTP ${xhr.status || '—'}).`, 'bad');
            if (watchingRef.current === idx) setGenErr(true);
          } else if (entry.status === 'pending') {
            entry.status = 'error';
            push('The stream ended without a deck.', 'bad');
            if (watchingRef.current === idx) setGenErr(true);
          }
        }
      }
    };
    xhr.onerror = () => {
      if (entry.dead) return;
      entry.status = 'error';
      push('Network error — check the server address on the first screen.', 'bad');
      if (watchingRef.current === idx) setGenErr(true);
    };
    xhr.send(JSON.stringify({
      items: itemsRef.current,
      day: slot.day,
      meal: slot.meal,
      picked: pickedRef.current.map((c) => c.name),
      offered: offeredList ?? [],
      constraints: { servings: 1, diet: consRef.current.diet ?? '', minutes: 45, restrictions: consRef.current.restrictions ?? '' },
    }));
  }

  // put a deck on screen, then quietly prefetch the next slot (speedup #2)
  function presentDeck(idx, cards) {
    watchingRef.current = null;
    setGenErr(false);
    const names = cards.map((c) => c.name);
    if (shownRef.current.idx === idx) shownRef.current.names = [...shownRef.current.names, ...names];
    else shownRef.current = { idx, names: [...names] };
    setDeck(cards); deckRef.current = cards;
    setPos(0); posRef.current = 0;
    setPeek(false);
    setScreen('deck');
    const nextIdx = idx + 1;
    if (nextIdx < slotsRef.current.length && !cacheRef.current[nextIdx]) startSlotFetch(nextIdx, names);
  }

  // show slot idx: instant if prefetched, mid-progress studio if streaming, fresh fetch otherwise
  function openSlot(idx) {
    const c = cacheRef.current[idx];
    if (c && c.status === 'done' && c.deck?.length) { presentDeck(idx, c.deck); return; }
    if (c && c.status === 'pending') {
      watchingRef.current = idx;
      setGenErr(false);
      setFeed([...c.events]);
      setScreen('studio');
      return;
    }
    if (c) discardSlotFetch(idx);
    watchingRef.current = idx;
    setGenErr(false);
    setFeed([]);
    setScreen('studio');
    startSlotFetch(idx, []);
  }

  // slot exhausted (or retry): drop the next slot's prefetch, regenerate this one
  function regenSlot(idx) {
    discardSlotFetch(idx + 1);
    discardSlotFetch(idx);
    watchingRef.current = idx;
    setGenErr(false);
    setFeed([]);
    setScreen('studio');
    startSlotFetch(idx, shownRef.current.idx === idx ? [...shownRef.current.names] : []);
  }

  // ---------- swipe ----------
  const pan = useRef(new Animated.ValueXY()).current;
  const rot = pan.x.interpolate({ inputRange: [-220, 0, 220], outputRange: ['-14deg', '0deg', '14deg'] });
  const likeOp = pan.x.interpolate({ inputRange: [0, 100], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOp = pan.x.interpolate({ inputRange: [-100, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  function commitSwipe(dir) {
    const card = deckRef.current[posRef.current];
    if (!card || flying.current) return;
    flying.current = true;
    Animated.timing(pan, { toValue: { x: dir > 0 ? 520 : -520, y: -40 }, duration: 240, useNativeDriver: false }).start(() => {
      setPeek(false);
      pan.setValue({ x: 0, y: 0 });
      flying.current = false;
      fetch(api('/api/swipe'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card, dir: dir > 0 ? 'like' : 'nope' }),
      }).catch(() => {});
      const idx = slotIdxRef.current;
      const slot = slotsRef.current[idx];
      if (dir > 0) {
        const pick = { ...card, day: card.day ?? slot?.day ?? 1, meal: card.meal ?? slot?.meal ?? 'dinner' };
        const chosen = [...pickedRef.current, pick];
        setPicked(chosen); pickedRef.current = chosen;
        const nextIdx = idx + 1;
        if (nextIdx >= slotsRef.current.length) { buildWeekPlan(chosen); return; }
        setSlotIdx(nextIdx); slotIdxRef.current = nextIdx;
        openSlot(nextIdx);
      } else if (posRef.current + 1 >= deckRef.current.length) {
        regenSlot(idx);
      } else {
        setPos((p) => p + 1);
      }
    });
  }
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > 90) commitSwipe(1);
      else if (g.dx < -90) commitSwipe(-1);
      else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  }), []);

  // ---------- week plan ----------
  async function buildWeekPlan(chosen) {
    for (const k of Object.keys(cacheRef.current)) discardSlotFetch(+k);
    watchingRef.current = null;
    setScreen('week');
    setWeekPlan(null);
    try {
      const p = await fetch(api('/api/planweek'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chosen, items: itemsRef.current }),
      }).then((r) => r.json());
      setWeekPlan(p && typeof p === 'object' ? p : {});
      fetch(api('/api/taste')).then((r) => r.json()).then((t) => setProfileTxt(t?.profile || t?.learned || '')).catch(() => {});
    } catch (e) { setWeekPlan({ error: String(e?.message ?? e) }); }
  }

  function logEaten(m, gi) {
    const on = !checked['eat' + gi];
    setChecked((c) => ({ ...c, ['eat' + gi]: on }));
    if (on && !eatPosted.current[gi]) {
      eatPosted.current[gi] = true;
      fetch(api('/api/log'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: m.name, day: m.day ?? 1, meal: m.meal ?? 'dinner', action: 'eaten' }),
      }).catch(() => {});
    }
  }

  function planAgain() {
    for (const k of Object.keys(cacheRef.current)) discardSlotFetch(+k);
    watchingRef.current = null;
    setPicked([]); pickedRef.current = [];
    setSlots([]); slotsRef.current = [];
    setSlotIdx(0); slotIdxRef.current = 0;
    setDeck([]); deckRef.current = [];
    setWeekPlan(null); setChecked({}); eatPosted.current = {};
    setScreen('q1');
  }
  function startOver() {
    planAgain();
    setPhotos([]); setItems([]); setFeed([]); setProfileTxt(''); setRestrict('');
    setScreen('capture');
  }

  // ---------- render ----------
  const card = deck[pos];
  const next = deck[pos + 1];
  const curSlot = slots[slotIdx];
  const slotTag = curSlot ? `GIORNO ${curSlot.day} · ${curSlot.it.toUpperCase()} — ${slotIdx + 1}/${slots.length}` : '';
  const slotEcho = curSlot ? `Day ${curSlot.day} · ${curSlot.en}` : '';
  const weekDays = [...new Set(picked.map((c) => c.day ?? 1))].sort((a, b) => a - b);
  const dayRows = (day) => {
    let snacks = 0;
    return picked.map((c, gi) => [c, gi]).filter(([c]) => (c.day ?? 1) === day)
      .map(([c, gi]) => {
        const nth = c.meal === 'snack' ? ++snacks : 0;
        const suffix = nth > 1 ? ` ${nth}` : '';
        return { c, gi, it: (MEAL_IT[c.meal] ?? cap(c.meal ?? 'dinner')) + suffix, en: cap(c.meal ?? 'dinner') + suffix };
      });
  };

  const BackBtn = ({ to }) => (
    <Pressable onPress={() => setScreen(to)} hitSlop={14}><Text style={s.back}>‹</Text></Pressable>
  );
  const LabelPair = ({ it, en }) => (
    <View style={s.labRow}>
      <Label>{it}</Label>
      {en ? <Text style={s.labEcho}>{en}</Text> : null}
    </View>
  );

  let footer = null;
  if (screen === 'capture') footer = (
    <View>
      <View style={s.row}>
        <View style={s.flex}><Ghost label="Camera" onPress={() => pickImages(true)} /></View>
        <View style={s.flex}><Ghost label="Gallery" onPress={() => pickImages(false)} /></View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Btn label="Analyze" onPress={analyze} disabled={!photos.length || anaBusy} />
      </View>
      <TextInput
        style={s.serverIn} value={server} onChangeText={setServer}
        autoCapitalize="none" autoCorrect={false} placeholder="server" placeholderTextColor={T.muted}
      />
    </View>
  );
  else if (screen === 'inv') footer = <Btn label="Continue" onPress={() => setScreen('q1')} disabled={!items.length} />;
  else if (screen === 'q2') footer = <Btn label="Continue" onPress={() => setScreen('q3')} />;
  else if (screen === 'q4') footer = (
    <View>
      <Btn label="Start planning" onPress={() => startPlanning(restrict)} />
      <View style={{ marginTop: 10 }}>
        <Ghost label="None — start planning" onPress={() => { setRestrict(''); startPlanning(''); }} />
      </View>
    </View>
  );
  else if (screen === 'studio' && genErr) footer = <Ghost label="Try again" onPress={() => regenSlot(slotIdxRef.current)} />;
  else if (screen === 'deck') footer = (
    <View>
      <View style={s.deckFootRow}>
        <Pressable style={s.round} onPress={() => commitSwipe(-1)} hitSlop={6}><Text style={[s.roundTxt, { color: T.muted }]}>✕</Text></Pressable>
        <Pressable style={s.round} onPress={() => commitSwipe(1)} hitSlop={6}><Text style={[s.roundTxt, { color: T.good }]}>✓</Text></Pressable>
      </View>
      <Text style={s.slotLine}>Slot {Math.min(slotIdx + 1, slots.length)} of {slots.length}{picked.length ? `  ·  ${picked.length} picked` : ''}</Text>
    </View>
  );
  else if (screen === 'week') footer = (
    <View>
      <Btn label="Plan again" onPress={planAgain} />
      <View style={{ marginTop: 10 }}><Ghost label="Start over" onPress={startOver} /></View>
    </View>
  );

  return (
    <Shell footer={footer}>
      <StatusBar barStyle="dark-content" backgroundColor={T.paper} />

      {screen === 'capture' && (
        <View style={s.flex}>
          <H>La Cucina</H>
          <Sub>Photograph the fridge, the pantry, the counter. We read every shelf.</Sub>
          <ScrollView style={s.flex} contentContainerStyle={s.thumbs} showsVerticalScrollIndicator={false}>
            {photos.map((p, i) => (
              <View key={p.uri + i} style={s.ph}>
                <Image source={{ uri: p.uri }} style={s.phImg} />
                <Pressable style={s.phRm} hitSlop={10} onPress={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}>
                  <Text style={s.phRmTxt}>×</Text>
                </Pressable>
              </View>
            ))}
            {!photos.length && (
              <Text style={s.emptyHint}>No photos yet. Fridge, pantry, counter — one shot of each is plenty.</Text>
            )}
          </ScrollView>
        </View>
      )}

      {screen === 'analyze' && (
        <View style={s.flex}>
          <H>Reading your shelves…</H>
          <Sub>Every photo at once. A few seconds.</Sub>
          <View style={s.barTrack}><View style={[s.barFill, { width: `${ana.total ? Math.round((ana.done / ana.total) * 100) : 0}%` }]} /></View>
          <Text style={s.anaPhotos}>FOTO {ana.done} DI {ana.total}</Text>
          <Text style={s.anaCount}>{ana.count} item{ana.count === 1 ? '' : 's'} so far</Text>
          {ana.names.length ? <Text style={s.anaLatest}>…{ana.names.join(', ')}</Text> : null}
          {ana.fail ? <Text style={s.anaFail}>{ana.fail} photo{ana.fail === 1 ? '' : 's'} couldn't be read</Text> : null}
        </View>
      )}

      {screen === 'inv' && (
        <View style={s.flex}>
          <H>We found {items.length} item{items.length === 1 ? '' : 's'}</H>
          <Sub>Tap a name to correct it. Remove what is wrong, add what we missed.</Sub>
          <View style={s.addRow}>
            <TextInput
              style={s.addIn} value={addVal} onChangeText={setAddVal}
              placeholder="Add something we missed…" placeholderTextColor={T.muted}
              onSubmitEditing={addItem} returnKeyType="done"
            />
            <Pressable onPress={addItem} hitSlop={14}><Text style={[s.addBtn, !addVal.trim() && { color: T.muted }]}>Add</Text></Pressable>
          </View>
          <Rule />
          <ScrollView style={s.flex} contentContainerStyle={{ paddingTop: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {items.some((it) => it?.freshness === 'use-soon') ? (
              <Text style={s.soonNote}>Marked items are best used soon.</Text>
            ) : null}
            {groups.map(([catName, arr]) => (
              <View key={catName} style={s.groupWrap}>
                <LabelPair it={CAT_IT[catName] ?? String(catName).toUpperCase()} en={CAT_IT[catName] ? String(catName) : ''} />
                <View style={s.chipsWrap}>
                  {arr.map(([it, i]) => (
                    <Chip
                      key={catName + i}
                      label={it.name}
                      qty={it.qty}
                      soon={it.freshness === 'use-soon'}
                      onPress={() => { setEditIdx(i); setEditVal(it.name); }}
                      onRemove={() => setItems((cur) => cur.filter((_, j) => j !== i))}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {screen === 'q1' && (
        <View style={s.flex}>
          <View style={s.topRow}><BackBtn to="inv" /><Dots total={4} index={0} /></View>
          <H>How long are we planning for?</H>
          <ScrollView style={s.flex} contentContainerStyle={{ paddingTop: 16 }} showsVerticalScrollIndicator={false}>
            {DAY_OPTS.map((o) => (
              <Choice key={o.v} label={o.label} sub={o.sub} selected={days === o.v} onPress={() => pickDays(o.v)} />
            ))}
          </ScrollView>
        </View>
      )}

      {screen === 'q2' && (
        <View style={s.flex}>
          <View style={s.topRow}><BackBtn to="q1" /><Dots total={4} index={1} /></View>
          <H>How many meals a day?</H>
          <View style={{ marginTop: 28 }}>
            <MSlider min={1} max={7} value={mealsN} onChange={setMealsN} />
          </View>
          <View style={{ marginTop: 16 }}>
            <Sub>{labeledMeals(mealsN).map((l) => l.toLowerCase()).join(' · ')}</Sub>
          </View>
        </View>
      )}

      {screen === 'q3' && (
        <View style={s.flex}>
          <View style={s.topRow}><BackBtn to="q2" /><Dots total={4} index={2} /></View>
          <H>How do you eat?</H>
          <View style={{ paddingTop: 16 }}>
            {DIET_OPTS.map((o) => (
              <Choice key={o.label} label={o.label} sub={o.sub} selected={diet === o.v} onPress={() => pickDiet(o.v)} />
            ))}
          </View>
        </View>
      )}

      {screen === 'q4' && (
        <View style={s.flex}>
          <View style={s.topRow}><BackBtn to="q3" /><Dots total={4} index={3} /></View>
          <H>Any other restrictions?</H>
          <Sub>Allergies, dislikes, rules — in your own words.</Sub>
          <TextInput
            style={s.restrictIn} value={restrict} onChangeText={setRestrict}
            placeholder="no onion & garlic, gluten-free, low sodium…" placeholderTextColor={T.muted}
            multiline
          />
        </View>
      )}

      {screen === 'studio' && (
        <View style={s.flex}>
          {slotTag ? <Label>{slotTag}</Label> : null}
          <H>The hunt for {curSlot ? curSlot.en.toLowerCase() : 'dinner'}</H>
          <Sub>Chefs draft, an auditor interrogates. Nothing invented.</Sub>
          <ScrollView
            ref={feedScroll} style={s.feedWrap} showsVerticalScrollIndicator={false}
            onContentSizeChange={() => feedScroll.current?.scrollToEnd({ animated: true })}
          >
            {feed.map((l, i) => <FeedLine key={i} t={l.t} txt={l.txt} cls={l.cls} />)}
            {!genErr && <ActivityIndicator color={T.muted} style={{ marginVertical: 14 }} />}
          </ScrollView>
        </View>
      )}

      {screen === 'deck' && (
        <View style={s.flex}>
          {slotTag ? (
            <View>
              <Label>{slotTag}</Label>
              <Text style={s.slotEcho}>{slotEcho}</Text>
            </View>
          ) : null}
          <View style={s.deckWrap}>
            {next && (
              <View style={[s.card, s.cardUnder]}>
                <Text style={s.underName}>{next.name}</Text>
              </View>
            )}
            {card && (
              <Animated.View
                {...responder.panHandlers}
                style={[s.card, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate: rot }] }]}
              >
                <Text style={s.dish}>{card.name}</Text>
                <Text style={s.meta}>
                  {[card.cuisine, card.minutes != null ? `${card.minutes} min` : null, card.difficulty].filter(Boolean).join(' · ') || '—'}
                  {card.risky ? <Text style={{ color: T.warn }}>  ·  a long shot</Text> : null}
                </Text>
                {card.why_you ? <Text style={s.why}>{card.why_you}</Text> : null}
                <ScrollView style={s.flex} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  <LabelPair it="DALLA CUCINA" en="from your kitchen" />
                  <Text style={s.uses}>{(card.uses ?? []).map((u) => u?.item).filter(Boolean).join(' · ') || '—'}</Text>
                  {card.missing?.length ? (
                    <View style={{ marginTop: 12 }}>
                      <LabelPair it="TI SERVE" en="you'd need" />
                      <Text style={s.need}>{card.missing.map((m) => (m?.item ?? '') + (m?.essential ? '' : ' (optional)')).filter(Boolean).join(' · ')}</Text>
                    </View>
                  ) : null}
                  {peek ? (
                    <View style={{ marginTop: 12 }}>
                      {(card.steps ?? []).map((st, i) => <Text key={i} style={s.stepTxt}>{i + 1}.  {st}</Text>)}
                    </View>
                  ) : null}
                </ScrollView>
                <Text style={s.nutri}>{nutriLine(card.nutrition)}</Text>
                <Pressable onPress={() => setPeek((p) => !p)} hitSlop={10}>
                  <Text style={s.peek}>{peek ? 'close the steps' : 'peek at the steps'}</Text>
                </Pressable>
                <Animated.View pointerEvents="none" style={[s.stampWrap, { left: 14, opacity: likeOp, transform: [{ rotate: '-10deg' }] }]}>
                  <Stamp kind="oui" />
                </Animated.View>
                <Animated.View pointerEvents="none" style={[s.stampWrap, { right: 14, opacity: nopeOp, transform: [{ rotate: '10deg' }] }]}>
                  <Stamp kind="non" />
                </Animated.View>
              </Animated.View>
            )}
          </View>
        </View>
      )}

      {screen === 'week' && (
        <View style={s.flex}>
          <H>Your week</H>
          <Sub>Tap a dish for its steps.</Sub>
          {!weekPlan ? (
            <View style={{ paddingTop: 22 }}>
              <View style={[s.skelBar, { width: 92 }]} />
              {[0, 1, 2].map((i) => (
                <View key={i} style={s.skelRow}>
                  <View style={[s.skelBar, { width: 64 }]} />
                  <View style={[s.skelBar, { flex: 1 }]} />
                  <View style={[s.skelBar, { width: 44 }]} />
                </View>
              ))}
              <Text style={[s.anaLatest, { marginTop: 20 }]}>Balancing the week…</Text>
            </View>
          ) : (
            <ScrollView style={s.flex} contentContainerStyle={{ paddingTop: 14, paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
              {weekPlan.error ? (
                <Text style={s.err}>The plan didn't come back — {weekPlan.error}. Try "Plan again" below.</Text>
              ) : null}
              {weekDays.map((day) => {
                const rows = dayRows(day);
                const dt = (weekPlan.dayTotals ?? []).find((d) => d?.day === day);
                const eatenKcal = rows.reduce((sum, { c, gi }) => sum + (checked['eat' + gi] ? (+c.nutrition?.kcal || 0) : 0), 0);
                return (
                  <View key={day} style={s.dayWrap}>
                    <Label>{`GIORNO ${day}`}</Label>
                    {rows.map(({ c, gi, it, en }) => (
                      <View key={gi}>
                        <Pressable style={s.mealRow} onPress={() => setChecked((ck) => ({ ...ck, ['wx' + gi]: !ck['wx' + gi] }))}>
                          <View style={s.mealTagWrap}>
                            <Text style={s.mealTag}>{it.toUpperCase()}</Text>
                            <Text style={s.mealTagEn}>{en}</Text>
                          </View>
                          <Text style={s.mealDish}>{c.name}</Text>
                          <Text style={s.mealKcal}>{c.nutrition?.kcal != null ? `${fmtK(c.nutrition.kcal)} kcal` : '—'}</Text>
                        </Pressable>
                        {checked['wx' + gi] ? (
                          <View style={{ paddingVertical: 8 }}>
                            {(c.steps ?? []).map((st, j) => <Text key={j} style={s.stepTxt}>{j + 1}.  {st}</Text>)}
                          </View>
                        ) : null}
                        <View style={s.tglRow}>
                          <Pressable onPress={() => setChecked((ck) => ({ ...ck, ['wm' + gi]: !ck['wm' + gi] }))} hitSlop={14}>
                            <Text style={[s.tgl, checked['wm' + gi] && { color: T.good }]}>will make</Text>
                          </Pressable>
                          <Pressable onPress={() => logEaten(c, gi)} hitSlop={14}>
                            <Text style={[s.tgl, checked['eat' + gi] && { color: T.accent }]}>ate it</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                    <View style={s.macroBox}>
                      <Text style={s.macroMain}>
                        {dt ? `${fmtK(dt.kcal)} kcal · P ${dt.protein_g ?? '—'} · C ${dt.carbs_g ?? '—'} · F ${dt.fat_g ?? '—'}` : 'day totals — not available'}
                      </Text>
                      {dt ? (
                        <Text style={s.macroMicro}>
                          fiber {dt.fiber_g ?? '—'} g · iron {dt.iron_mg ?? '—'} mg · sodium {fmtK(dt.sodium_mg)} mg · vit C {dt.vitc_mg ?? '—'} mg
                        </Text>
                      ) : null}
                      <Text style={[s.macroEaten, eatenKcal ? { color: T.accent } : null]}>eaten so far: {fmtK(eatenKcal)} kcal</Text>
                    </View>
                  </View>
                );
              })}

              <LabelPair it="SPESA" en="shopping gaps" />
              {weekPlan.shopping?.length ? weekPlan.shopping.map((sh, i) => (
                <Pressable key={i} style={s.shopRow} onPress={() => setChecked((ck) => ({ ...ck, ['sh' + i]: !ck['sh' + i] }))}>
                  <View style={[s.box, checked['sh' + i] && s.boxOn]}>
                    {checked['sh' + i] ? <Text style={s.boxTick}>✓</Text> : null}
                  </View>
                  <Text style={[s.shopTxt, checked['sh' + i] && s.shopDone]}>{sh?.item}{sh?.qty ? ` (${sh.qty})` : ''}</Text>
                  {sh?.for?.length ? <Text style={s.shopFor}>for {sh.for.join(', ')}</Text> : null}
                </Pressable>
              )) : <Text style={s.tip}>Nothing to buy — the whole plan is already on your shelves.</Text>}

              {(weekPlan.tips?.length || weekPlan.contested?.length || weekPlan.useSoonUnused?.length) ? (
                <View style={{ marginTop: 26 }}>
                  <Label>NOTE</Label>
                  {(weekPlan.tips ?? []).map((t, i) => <Text key={i} style={s.tip}>— {t}</Text>)}
                  {(weekPlan.contested ?? []).map((c, i) => (
                    <Text key={'c' + i} style={s.tip}>— {c?.item} is wanted by {(c?.by ?? []).join(' and ')}; portion it.</Text>
                  ))}
                  {weekPlan.useSoonUnused?.length ? (
                    <Text style={s.tip}>— Still unused and fading: {weekPlan.useSoonUnused.join(', ')}.</Text>
                  ) : null}
                </View>
              ) : null}

              {profileTxt ? (
                <View style={{ marginTop: 26 }}>
                  <LabelPair it="MEMORIA DEL GUSTO" en="taste memory" />
                  <Text style={s.taste}>{profileTxt}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      )}

      <Modal visible={editIdx >= 0} transparent animationType="fade" onRequestClose={() => setEditIdx(-1)}>
        <View style={s.modalBg}>
          <View style={s.modalBox}>
            <Text style={s.modalH}>Edit item</Text>
            <TextInput style={s.modalIn} value={editVal} onChangeText={setEditVal} autoFocus />
            <View style={[s.row, { marginTop: 20 }]}>
              <View style={s.flex}><Ghost label="Cancel" onPress={() => setEditIdx(-1)} /></View>
              <View style={s.flex}>
                <Btn label="Save" onPress={() => {
                  const v = editVal.trim();
                  if (v && editIdx >= 0) setItems((cur) => cur.map((it, j) => (j === editIdx ? { ...it, name: v } : it)));
                  setEditIdx(-1);
                }} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Shell>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  back: { fontSize: 34, lineHeight: 36, color: T.ink, fontFamily: T.serif, paddingRight: 14 },
  labRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  labEcho: { color: T.muted, fontSize: 10, letterSpacing: 0.4 },

  // capture
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 20, paddingBottom: 8 },
  ph: { width: '31%', aspectRatio: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: T.hair, backgroundColor: T.hair },
  phImg: { width: '100%', height: '100%' },
  phRm: { position: 'absolute', top: 0, right: 0, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: T.paper },
  phRmTxt: { color: T.ink, fontSize: 14, lineHeight: 16 },
  emptyHint: { color: T.muted, fontSize: 13, lineHeight: 19, paddingTop: 26, width: '100%', textAlign: 'center' },
  serverIn: { color: T.muted, fontSize: 11, textAlign: 'center', paddingTop: 14, paddingBottom: 0 },

  // analyze
  barTrack: { height: 2, backgroundColor: T.hair, marginTop: 34, marginBottom: 12, alignSelf: 'stretch' },
  barFill: { height: 2, backgroundColor: T.accent },
  anaPhotos: { color: T.muted, fontSize: 11, letterSpacing: 1.2 },
  anaCount: { fontFamily: T.serif, fontSize: 21, color: T.ink, marginTop: 26 },
  anaLatest: { color: T.muted, fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  anaFail: { color: T.warn, fontSize: 12.5, marginTop: 12 },

  // inventory
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18, marginBottom: 16 },
  addIn: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.muted, color: T.ink, fontSize: 14.5, paddingVertical: 8, paddingHorizontal: 0 },
  addBtn: { color: T.ink, fontSize: 13, letterSpacing: 0.4 },
  soonNote: { color: T.muted, fontSize: 11.5, marginBottom: 14 },
  groupWrap: { marginBottom: 22 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },

  // wizard
  restrictIn: {
    marginTop: 22, minHeight: 96, textAlignVertical: 'top', color: T.ink, fontSize: 15, lineHeight: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.muted, padding: 14,
  },

  // studio (slot generation feed)
  feedWrap: { flex: 1, marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.hair, paddingTop: 6 },

  // deck
  slotEcho: { color: T.muted, fontSize: 11, marginTop: 2 },
  deckWrap: { flex: 1, marginTop: 12, marginBottom: 4, minHeight: 340 },
  card: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: T.paper, borderWidth: 1, borderColor: T.hair, padding: 20 },
  cardUnder: { transform: [{ scale: 0.97 }, { translateY: -8 }] },
  underName: { fontFamily: T.serif, fontSize: 20, color: T.muted },
  dish: { fontFamily: T.serif, fontSize: 26, lineHeight: 32, color: T.ink },
  meta: { color: T.muted, fontSize: 13, marginTop: 8, marginBottom: 12 },
  why: { fontFamily: T.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: T.accent, marginBottom: 14 },
  uses: { color: T.ink, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  need: { color: T.warn, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  stepTxt: { color: T.ink, fontSize: 13.5, lineHeight: 21, marginTop: 6 },
  nutri: { color: T.muted, fontSize: 12.5, fontVariant: ['tabular-nums'], marginTop: 12 },
  peek: { color: T.muted, fontSize: 13, textAlign: 'center', paddingTop: 12 },
  stampWrap: { position: 'absolute', top: 16 },
  deckFootRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  round: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: T.hair, alignItems: 'center', justifyContent: 'center', backgroundColor: T.paper },
  roundTxt: { fontSize: 20, lineHeight: 24 },
  slotLine: { color: T.muted, fontSize: 12, textAlign: 'center', paddingTop: 12, fontVariant: ['tabular-nums'] },

  // week
  dayWrap: { marginBottom: 30 },
  mealRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14, paddingBottom: 6 },
  mealTagWrap: { width: 86, paddingTop: 4 },
  mealTag: { color: T.muted, fontSize: 10.5, letterSpacing: 1 },
  mealTagEn: { color: T.muted, fontSize: 9.5, letterSpacing: 0.4, marginTop: 2, opacity: 0.75 },
  mealDish: { fontFamily: T.serif, fontSize: 17, lineHeight: 23, color: T.ink, flex: 1 },
  mealKcal: { color: T.muted, fontSize: 12.5, fontVariant: ['tabular-nums'], paddingTop: 4 },
  tglRow: { flexDirection: 'row', gap: 26, paddingTop: 6, paddingBottom: 12, paddingLeft: 96, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.hair },
  tgl: { color: T.muted, fontSize: 12.5 },
  macroBox: { borderWidth: StyleSheet.hairlineWidth, borderColor: T.muted, padding: 12, marginTop: 16 },
  macroMain: { color: T.ink, fontSize: 13.5, fontVariant: ['tabular-nums'], textAlign: 'center' },
  macroMicro: { color: T.muted, fontSize: 11.5, fontVariant: ['tabular-nums'], textAlign: 'center', marginTop: 5 },
  macroEaten: { color: T.muted, fontSize: 11.5, textAlign: 'center', marginTop: 5 },
  err: { color: T.accent, fontSize: 13.5, lineHeight: 20, marginBottom: 14 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.hair },
  box: { width: 16, height: 16, borderWidth: 1, borderColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: T.ink, borderColor: T.ink },
  boxTick: { color: T.paper, fontSize: 10, lineHeight: 12 },
  shopTxt: { color: T.ink, fontSize: 14, flex: 1 },
  shopDone: { color: T.muted, textDecorationLine: 'line-through' },
  shopFor: { color: T.muted, fontSize: 11, maxWidth: 130 },
  tip: { color: T.ink, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  taste: { fontFamily: T.serif, fontStyle: 'italic', color: T.muted, fontSize: 14.5, lineHeight: 22, marginTop: 8 },

  // loading skeleton (week)
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.hair },
  skelBar: { height: 11, backgroundColor: T.hair },

  // modal
  modalBg: { flex: 1, backgroundColor: 'rgba(23,21,18,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: T.paper, borderWidth: 1, borderColor: T.hair, padding: 22, width: '100%' },
  modalH: { fontFamily: T.serif, fontSize: 21, color: T.ink, marginBottom: 16 },
  modalIn: { borderBottomWidth: 1, borderBottomColor: T.ink, color: T.ink, fontSize: 16, fontFamily: T.serif, paddingVertical: 8, paddingHorizontal: 0 },
});
