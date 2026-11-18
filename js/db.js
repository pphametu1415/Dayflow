/* DayFlow v2 — 保存とデータ操作。
   画面（js/app.js）と service worker（sw.js）の両方から読み込む。
   予定（plans）と実績（sessions）は別レコード。実績分は保存せず、開始・終了時刻から計算する。 */
(function (root) {
  'use strict';
  const NAME = 'dayflow', VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        const mk = (n, o) => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, o); };
        mk('cards', { keyPath: 'id' });
        mk('units', { keyPath: 'id' });
        mk('plans', { keyPath: 'id' });
        mk('sessions', { keyPath: 'id' });
        mk('reviews', { keyPath: 'date' });
        mk('meta', { keyPath: 'key' });
        mk('log', { keyPath: 'n', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }

  function run(store, mode, fn) {
    return open().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      const r = fn(t.objectStore(store));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('abort'));
    }));
  }
  const all = s => run(s, 'readonly', o => o.getAll());
  const get = (s, k) => run(s, 'readonly', o => o.get(k));
  const put = (s, v) => run(s, 'readwrite', o => o.put(v));
  const del = (s, k) => run(s, 'readwrite', o => o.delete(k));
  const putMany = (s, arr) => run(s, 'readwrite', o => { arr.forEach(v => o.put(v)); });
  const clear = s => run(s, 'readwrite', o => o.clear());

  /* ---- 日付と時刻 ---- */
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const epochOf = (k, min) => { const d = keyToDate(k); d.setMinutes(min); return d.getTime(); };
  const parseHm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  /* 1日の区切りは深夜3時。0:00〜2:59 は前の日の続き（24:00〜26:59）として記録・表示する。 */
  const DAY_SHIFT_MIN = 3 * 60;
  const dayOf = ms => dateKey(new Date(ms - DAY_SHIFT_MIN * 60000));              // その時刻が属する日
  const minOn = (k, ms) => Math.floor((ms - keyToDate(k).getTime()) / 60000);     // その日の0:00からの分（翌日の分は1440以上）
  const dayMin = s => { const m = parseHm(s); return m < DAY_SHIFT_MIN ? m + 1440 : m; };   // 時刻の入力（0:00〜2:59 は翌日の分）
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---- 設定値 ---- */
  const getMeta = async (key, fallback) => { const m = await get('meta', key); return m ? m.value : fallback; };
  const setMeta = (key, value) => put('meta', { key, value });

  /* ---- 初期カード ---- */
  const SEED_CARDS = [
    { id: 'c-gyosei', name: '行政法規', category: 'study', minutes: 130 },
    { id: 'c-kantei', name: '鑑定理論', category: 'study', minutes: 100 },
    { id: 'c-anki', name: '基準の暗記', category: 'study', minutes: 30 },
    { id: 'c-yobi', name: '積み残しの回収', category: 'study', minutes: 150 },
    { id: 'c-walk', name: '散歩', category: 'exercise', minutes: 20 },
    { id: 'c-kintore', name: '筋トレ', category: 'exercise', minutes: 45 },
    { id: 'c-clean', name: '掃除', category: 'house', minutes: 30 },
    { id: 'c-cook', name: '自炊・食事', category: 'life', minutes: 45 },
    { id: 'c-read', name: '読書', category: 'hobby', minutes: 60 },
    { id: 'c-sleep', name: '睡眠', category: 'sleep', minutes: 480 }
  ];
  async function ensureSeed() {
    if (await getMeta('seeded', false)) return;
    await putMany('cards', SEED_CARDS.map((c, i) => ({ ...c, order: i })));
    await setMeta('seeded', true);
  }

  /* ---- 実績（session）----
     endedAt が null のものが「計測中」。同時に1件まで。 */
  async function running() {
    return (await all('sessions')).find(s => s.endedAt == null) || null;
  }
  async function startSession(o) {
    const r = await running();
    if (r) return { ok: false, reason: 'running', session: r };
    const at = o.at || Date.now();
    const s = {
      id: uid('s'), date: dayOf(at),
      planId: o.planId || null, unitId: o.unitId || null, cardId: o.cardId || null,
      name: o.name, category: o.category,
      startedAt: at, endedAt: null,
      startSource: o.source || 'phone', endSource: null,
      needsCheck: false, extendMin: 0
    };
    await put('sessions', s);
    return { ok: true, session: s };
  }
  async function startPlan(planId, source, at, name) {
    const p = await get('plans', planId);
    if (!p) return { ok: false, reason: 'noplan' };
    if (p.status === 'skipped') { p.status = 'active'; await put('plans', p); }
    return startSession({ planId: p.id, unitId: p.unitId, cardId: p.cardId, name: name || p.name, category: p.category, source, at });
  }
  async function startCard(cardId, source) {
    const c = await get('cards', cardId);
    if (!c) return { ok: false, reason: 'nocard' };
    return startSession({ cardId: c.id, name: c.name, category: c.category, source });
  }
  /* source: 'phone' | 'watch' | 'auto' | 'edited'。自動終了は needsCheck=true で後から直せるようにする。 */
  /* 中断・再開。pauses は [{ from, to }]（to が null なら中断中）。実績の分数からは中断した時間を除く。 */
  const openPause = s => (s.pauses || []).find(p => p.to == null) || null;
  async function pauseRunning(at) {
    const r = await running();
    if (!r) return { ok: false, reason: 'none' };
    if (openPause(r)) return { ok: true, session: r };
    r.pauses = [...(r.pauses || []), { from: Math.max(r.startedAt, at || Date.now()), to: null }];
    await put('sessions', r);
    return { ok: true, session: r };
  }
  async function resumeRunning(at) {
    const r = await running();
    if (!r) return { ok: false, reason: 'none' };
    const p = openPause(r);
    if (!p) return { ok: true, session: r };
    p.to = Math.max(p.from, at || Date.now());
    await put('sessions', r);
    return { ok: true, session: r };
  }
  async function finishRunning(source, at, needsCheck) {
    const r = await running();
    if (!r) return { ok: false, reason: 'none' };
    const op = openPause(r);
    if (op) {                 // 中断したまま完了したら、中断した時点で終わったことにする
      r.pauses = r.pauses.filter(p => p !== op);
      at = Math.min(at || Date.now(), op.from);
    }
    r.endedAt = Math.max(r.startedAt + 1000, at || Date.now());
    r.endSource = source || 'phone';
    r.needsCheck = !!needsCheck;
    await put('sessions', r);
    return { ok: true, session: r };
  }
  async function extendRunning(min) {
    const r = await running();
    if (!r) return { ok: false, reason: 'none' };
    r.extendMin = (r.extendMin || 0) + min;
    await put('sessions', r);
    return { ok: true, session: r };
  }

  /* ---- 予定（plan）----
     スキップは状態として残す。「10分後」は予定を動かさず notifyAt（通知時刻）だけ遅らせる。 */
  async function skipPlan(planId, skipped) {
    const p = await get('plans', planId);
    if (!p) return { ok: false, reason: 'noplan' };
    p.status = skipped === false ? 'active' : 'skipped';
    await put('plans', p);
    return { ok: true, plan: p };
  }
  async function snoozePlan(planId, min, at) {
    const p = await get('plans', planId);
    if (!p) return { ok: false, reason: 'noplan' };
    p.notifyAt = (at || Date.now()) + min * 60000;
    p.snoozeCount = (p.snoozeCount || 0) + 1;
    await put('plans', p);
    return { ok: true, plan: p };
  }

  /* ---- 学習コマの取り込み ----
     def は data/units-YYYY-MM.json の中身。チェックやメモなど本人の記録は残したまま定義だけ更新する。
     コマ1つにつき予定を1つ作る（id は 'u-' + コマid）。本人が動かした予定・実績のある予定は触らない。 */
  async function importUnits(def) {
    const [oldUnits, oldPlans, sessions] = await Promise.all([all('units'), all('plans'), all('sessions')]);
    const uMap = new Map(oldUnits.map(u => [u.id, u]));
    const pMap = new Map(oldPlans.map(p => [p.id, p]));
    const used = new Set(sessions.map(s => s.planId).filter(Boolean));
    const cardOf = k => (k === 'k' ? 'c-kantei' : k === 'y' ? 'c-yobi' : 'c-gyosei');
    const cursor = {};
    const units = [], plans = [], keep = new Set();
    for (const [seq, u] of def.units.entries()) {
      const old = uMap.get(u.id);
      const init = (!old && def.initial && def.initial[u.id]) || {};
      units.push({
        ...u, month: def.month, seq,
        lecDone: old ? !!old.lecDone : !!init.lecDone,
        exDone: old ? !!old.exDone : !!init.exDone,
        memo: old ? (old.memo || '') : '',
        manualMin: old && old.manualMin != null ? old.manualMin : null
      });
      keep.add(u.id);
      const slot = (def.slots && def.slots[u.slot]) || { start: '20:00' };
      const ck = u.date + '|' + u.slot;
      const start = cursor[ck] == null ? parseHm(slot.start) : cursor[ck];
      cursor[ck] = start + u.est;
      const pid = 'u-' + u.id, op = pMap.get(pid);
      const name = u.subj + ' ' + u.title;
      if (op && (op.userEdited || used.has(pid))) {
        plans.push({ ...op, name });
      } else {
        plans.push({
          id: pid, date: u.date, start, minutes: u.est, cardId: cardOf(u.k), name, category: 'study',
          unitId: u.id, fixed: false, status: op ? op.status : 'active', notifyAt: op ? (op.notifyAt || null) : null,
          userEdited: false
        });
      }
    }
    // 定義から消えたコマは、実績がなければ予定ごと消す。
    for (const u of oldUnits) {
      if (u.month !== def.month || keep.has(u.id)) continue;
      if (used.has('u-' + u.id)) continue;
      await del('units', u.id);
      await del('plans', 'u-' + u.id);
    }
    await putMany('units', units);
    await putMany('plans', plans);
    await setMeta('units:' + def.month, {
      version: def.version, label: def.label || '', exam: def.exam || '', examLabel: def.examLabel || '',
      rules: def.rules || [], slots: def.slots || {}, backlogLimit: def.backlogLimit || 4
    });
    return units.length;
  }

  /* ---- 書き出し／読み込み ---- */
  const DATA_STORES = ['cards', 'units', 'plans', 'sessions', 'reviews', 'meta'];
  async function exportAll() {
    const out = { app: 'dayflow', schema: VERSION, exportedAt: new Date().toISOString() };
    for (const s of DATA_STORES) out[s] = await all(s);
    return out;
  }
  async function importAll(data) {
    if (!data || data.app !== 'dayflow') throw new Error('DayFlowの書き出しファイルではありません');
    for (const s of DATA_STORES) {
      if (!Array.isArray(data[s])) throw new Error('ファイルの中身が欠けています（' + s + '）');
    }
    for (const s of DATA_STORES) { await clear(s); await putMany(s, data[s]); }
  }

  /* ---- 記録（通知テスト用）---- */
  const addLog = entry => put('log', { t: Date.now(), ...entry });
  const getLog = () => all('log');
  const clearLog = () => clear('log');

  root.DFDB = {
    all, get, put, del, putMany, clear,
    pad, dateKey, keyToDate, epochOf, parseHm, uid, DAY_SHIFT_MIN, dayOf, minOn, dayMin,
    getMeta, setMeta, ensureSeed,
    running, startSession, startPlan, startCard, finishRunning, extendRunning, pauseRunning, resumeRunning, openPause,
    skipPlan, snoozePlan, importUnits, exportAll, importAll,
    addLog, getLog, clearLog
  };
})(typeof self !== 'undefined' ? self : this);
