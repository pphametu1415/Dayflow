/* DayFlow v2 — 画面。データ操作は js/db.js（DFDB）に置き、ここは表示と入力だけを受け持つ。 */
(() => {
  'use strict';
  const DB = window.DFDB, SEA = window.DFSea, THEME = window.DFTheme;
  const APP_VERSION = '2.5.0';
  const START = 6 * 60, END = 24 * 60 + DB.DAY_SHIFT_MIN, HOURPX = 64, PPM = HOURPX / 60;   // タイムラインは 6:00〜翌3:00
  const TARGET_WEEK_MIN = 24.5 * 60;               // 週の学習枠（平日2.5h×5＋休日6h×2）
  const OVERDUE_MIN = 30;                           // 予定終了からこの分数を過ぎたら終了を確認する
  const CATS = { study: '勉強', exercise: '運動', hobby: '趣味', house: '家事', life: '生活', sleep: '睡眠' };
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

  let S = { cards: [], units: [], plans: [], sessions: [], reviews: [], meta: {} };
  let dateKey = DB.dayOf(Date.now());
  let weekKey = dateKey;
  let view = 'day', planFilter = 'today';
  let editPlanId = null, newPlanMin = null, editSesId = null, newSesMin = null, editCardId = null, unitSheetId = null;
  let undo = null, drag = null, justDragged = false, reviewDraft = null, toastTimer = null;
  const overdueSnooze = {}, openMemos = new Set();
  let mateKey = '', mateIdx = 0, mateTimer = null, swimTimer = null;
  let tlFull = false, tlFrom = START;      // タイムラインの表示開始。ふだんは最初の予定・実績・現在時刻の1時間前から

  /* ---------- 小道具 ---------- */
  const today = () => DB.dayOf(Date.now());                 // 深夜3時までは前の日
  const nowMin = () => DB.minOn(today(), Date.now());       // 今日の0:00からの分（深夜は1440以上）
  const hm = m => DB.pad(Math.floor(m / 60) % 24) + ':' + DB.pad(m % 60);
  const hmE = ms => { const d = new Date(ms); return DB.pad(d.getHours()) + ':' + DB.pad(d.getMinutes()); };
  const snap = m => Math.round(m / 5) * 5;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = m => { m = Math.round(m || 0); return m >= 60 ? Math.floor(m / 60) + '時間' + (m % 60 ? (m % 60) + '分' : '') : m + '分'; };
  const hours = m => (m / 60).toFixed(1);
  const addDays = (k, n) => { const d = DB.keyToDate(k); d.setDate(d.getDate() + n); return DB.dateKey(d); };
  const md = k => { const d = DB.keyToDate(k); return (d.getMonth() + 1) + '/' + d.getDate(); };
  const weekStart = k => { const d = DB.keyToDate(k); return addDays(k, -((d.getDay() + 6) % 7)); };
  const sessMin = s => Math.max(1, Math.round(((s.endedAt == null ? Date.now() : s.endedAt) - s.startedAt) / 60000));

  /* absorbed：予備の枠をほぼ使い切った予定（コマを入れた残りが30分未満）。画面にも通知にも出さない。
     early：計測せずに先に終えたコマの予定（組み直しで元の枠を次のコマに譲ったもの）。タイムラインには出さない。 */
  const plansOf = k => S.plans.filter(p => p.date === k && !p.absorbed && !p.early).sort((a, b) => a.start - b.start);
  const sessionsOf = k => S.sessions.filter(s => s.date === k).sort((a, b) => a.startedAt - b.startedAt);
  const sessionsOfPlan = id => S.sessions.filter(s => s.planId === id);
  const runningS = () => S.sessions.find(s => s.endedAt == null) || null;
  const planById = id => S.plans.find(p => p.id === id);
  const unitById = id => S.units.find(u => u.id === id);
  /* コマの日付は「予定の日付」で見る（後ろへ送ったコマは、計画データの日付と予定の日付がずれる）。 */
  const unitPlan = u => planById('u-' + u.id);
  const uDate = u => { const p = unitPlan(u); return p ? p.date : u.date; };
  const uStart = u => { const p = unitPlan(u); return p ? p.start : 0; };
  const wdOf = k => WD[DB.keyToDate(k).getDay()];
  const cardById = id => S.cards.find(c => c.id === id);
  const unitCheckable = u => u.lec || !!u.exLabel;
  const unitDone = u => unitCheckable(u) && (!u.lec || u.lecDone) && (!u.exLabel || u.exDone);
  const unitMeasured = u => S.sessions.filter(s => s.unitId === u.id).reduce((a, s) => a + sessMin(s), 0);
  const unitActual = u => (u.manualMin != null ? u.manualMin : unitMeasured(u));
  const plannedMin = s => { const p = s.planId && planById(s.planId), c = s.cardId && cardById(s.cardId); return ((p && p.minutes) || (c && c.minutes) || 60) + (s.extendMin || 0); };
  const plannedEnd = s => s.startedAt + plannedMin(s) * 60000;
  const notifyCats = () => S.meta.notifyCats || ['study', 'exercise'];
  const monthMetas = () => Object.keys(S.meta).filter(k => k.startsWith('units:')).sort().map(k => ({ month: k.slice(6), ...S.meta[k] }));

  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  const show = id => $(id).classList.add('show');
  const hide = id => $(id).classList.remove('show');
  const anySheetOpen = () => !!document.querySelector('.sheetback.show');
  function confirmSheet(text, yesLabel) {
    return new Promise(res => {
      $('#cfText').textContent = text; $('#cfYes').textContent = yesLabel || '実行する';
      const done = v => { hide('#confirmBack'); $('#cfYes').onclick = $('#cfNo').onclick = null; res(v); };
      $('#cfYes').onclick = () => done(true); $('#cfNo').onclick = () => done(false);
      show('#confirmBack');
    });
  }

  /* ---------- 読み込みと反映 ---------- */
  async function reload() {
    const [cards, units, plans, sessions, reviews, meta] = await Promise.all(['cards', 'units', 'plans', 'sessions', 'reviews', 'meta'].map(DB.all));
    cards.sort((a, b) => (a.order || 0) - (b.order || 0));
    S = { cards, units, plans, sessions, reviews, meta: Object.fromEntries(meta.map(m => [m.key, m.value])) };
  }
  async function commit() { await reload(); renderAll(); syncNative(); }
  /* 進み具合 → 海の明るさ。積み残しなし＝明るい海、積み残しあり＝少し潜った海、
     積み残しが上限を超えた・計画の期間からはみ出したコマがある＝深い海。 */
  function progress() {
    const t = today(), metas = monthMetas(), meta = metas[metas.length - 1];
    const limit = (meta && meta.backlogLimit) || 4;
    const open = S.units.filter(u => unitCheckable(u) && !unitDone(u) && !(unitPlan(u) || {}).absorbed);
    const planEnd = S.units.reduce((m, u) => (u.date > m ? u.date : m), '');
    const backlog = open.filter(u => uDate(u) < t).length;
    const outside = planEnd ? open.filter(u => uDate(u) > planEnd).length : 0;
    const level = (outside > 0 || backlog > limit) ? 'deep' : backlog > 0 ? 'mid' : 'light';
    return { backlog, outside, limit, level };
  }
  function renderAll() {
    if (THEME) THEME.setLevel(progress().level);
    if (view === 'day') renderDay();
    else if (view === 'plan') renderPlan();
    else if (view === 'week') renderWeek();
    else renderSettings();
  }

  /* 月ごとのコマ定義（data/）を確認し、新しい版があれば取り込む。オフラインなら何もしない。 */
  async function syncUnits() {
    try {
      const idx = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
      for (const m of idx.months || []) {
        const cur = S.meta['units:' + m.month];
        if (cur && cur.version === m.version) continue;
        const def = await (await fetch('data/' + m.file, { cache: 'no-cache' })).json();
        await DB.importUnits(def);
      }
    } catch (_) { /* 次回起動時にもう一度試す */ }
  }

  /* ---------- 今日 ---------- */
  function renderDay() {
    const d = DB.keyToDate(dateKey);
    $('#dateTitle').textContent = `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
    $('#dateSub').textContent = dateKey === today() ? '今日' : dateKey;
    $('#dayMate').innerHTML = SEA.byWeekday[d.getDay()];
    if (mateKey !== dateKey) $('#mateBubble').hidden = true;
    const ps = plansOf(dateKey).filter(p => p.status !== 'skipped'), ss = sessionsOf(dateKey);
    $('#mPlan').textContent = fmt(ps.reduce((a, p) => a + p.minutes, 0));
    $('#mAct').textContent = fmt(ss.reduce((a, s) => a + sessMin(s), 0));
    $('#mStudy').textContent = fmt(ss.filter(s => s.category === 'study').reduce((a, s) => a + sessMin(s), 0));
    renderNow(); renderTimeline(); renderReviewMini();
  }

  function nextPlan() {
    const now = nowMin();
    const c = plansOf(today()).filter(p => {
      if (p.status === 'skipped' || sessionsOfPlan(p.id).length) return false;
      const u = p.unitId && unitById(p.unitId);
      return !(u && unitDone(u));
    });
    return c.find(p => p.start + p.minutes > now) || c[c.length - 1] || null;
  }

  function renderNow() {
    const el = $('#nowCard'), r = runningS();
    if (r) {
      el.innerHTML = `<div class="now running">
        <div><div class="label">計測中</div><div class="name">${esc(r.name)}</div></div>
        <div class="elapsed">${fmt(sessMin(r))}</div>
        <div class="meta">${hmE(r.startedAt)} 開始・予定 ${plannedMin(r)}分（${hmE(plannedEnd(r))} まで）</div>
        <div class="row"><button class="go" data-act="finish">完了</button></div></div>`;
      return;
    }
    if (dateKey !== today()) { el.innerHTML = ''; return; }
    const p = nextPlan();
    if (!p) {
      el.innerHTML = `<div class="now"><div class="label">次のコマ</div><div class="meta">今日これから始める予定はありません。下の「予定なしで開始」か、予定の列をタップして追加できます。</div></div>`;
      return;
    }
    const late = nowMin() - p.start;
    const lateTxt = late > 0 ? `<span class="late">・開始予定から${fmt(late)}経過</span>` : late < 0 ? `・あと${fmt(-late)}` : '';
    el.innerHTML = `<div class="now">
      <div><div class="label">次のコマ</div><div class="name">${esc(p.name)}</div></div>
      <div class="meta">${hm(p.start)}〜${hm(p.start + p.minutes)}（${p.minutes}分）${lateTxt}</div>
      <div class="row"><button class="go" data-act="start" data-id="${p.id}">開始</button><button class="btn side" data-act="skip" data-id="${p.id}">スキップ</button></div></div>`;
  }

  function renderTimeline() {
    const el = $('#timeline');
    const marks = [...plansOf(dateKey).map(p => p.start), ...sessionsOf(dateKey).map(s => DB.minOn(s.date, s.startedAt))];
    if (dateKey === today()) marks.push(nowMin());
    tlFrom = tlFull || !marks.length ? START : clamp(Math.floor(Math.min(...marks) / 60) * 60 - 60, START, END - 240);
    $('#tlToggle').textContent = tlFull ? '縮小' : '全日';
    $('#tlToggle').hidden = !tlFull && tlFrom === START;
    el.style.height = (END - tlFrom) * PPM + 'px';
    let h = '';
    for (let m = tlFrom; m < END; m += 60) {
      const y = (m - tlFrom) * PPM;
      h += `<div class="hourlabel${m === tlFrom ? ' first' : ''}" style="top:${y}px">${hm(m)}</div>`;
      if (m === 24 * 60) h += `<div class="midnight" style="top:${y}px"><span>ここから翌日</span></div>`;
      h += `<button class="zone p" data-zone="p" data-slot="${m}" style="top:${y}px;height:${HOURPX}px" aria-label="${hm(m)}台に予定を追加"></button>`;
      h += `<button class="zone a" data-zone="a" data-slot="${m}" style="top:${y}px;height:${HOURPX}px" aria-label="${hm(m)}台に実績を追加"></button>`;
    }
    for (const p of plansOf(dateKey)) {
      const a = Math.max(p.start, tlFrom), b = Math.min(p.start + p.minutes, END);
      if (b <= a) continue;
      const hgt = Math.max(24, (b - a) * PPM - 2), tiny = hgt < 44;
      const u = p.unitId && unitById(p.unitId), done = u && unitDone(u), skipped = p.status === 'skipped';
      const meta = `${hm(p.start)}〜${hm(p.start + p.minutes)}・${p.minutes}分${p.fixed ? '・固定' : ''}${skipped ? '・スキップ' : ''}`;
      h += `<button class="blk plan ${p.category}${tiny ? ' tiny' : ''}${p.fixed ? ' fixed' : ''}${skipped ? ' skipped' : ''}" data-plan="${p.id}" style="top:${(a - tlFrom) * PPM + 1}px;height:${hgt}px">
        <span class="t">${tiny ? '<b data-time>' + hm(p.start) + '</b> ' : ''}${esc(p.name)}</span><span class="m" data-meta>${meta}</span>${done ? '<span class="stamp">済</span>' : ''}</button>`;
    }
    for (const s of sessionsOf(dateKey)) {
      const live = s.endedAt == null, from = DB.minOn(s.date, s.startedAt), a = Math.max(from, tlFrom);
      const b = Math.min(from + sessMin(s), END);
      if (b <= a) continue;
      const hgt = Math.max(22, (b - a) * PPM - 2), tiny = hgt < 44;
      const meta = `${hmE(s.startedAt)}〜${live ? '計測中' : hmE(s.endedAt)}・${sessMin(s)}分${s.needsCheck ? '・要確認' : ''}`;
      h += `<button class="blk act ${s.category}${tiny ? ' tiny' : ''}${live ? ' live' : ''}${s.needsCheck ? ' check' : ''}" data-ses="${s.id}" style="top:${(a - tlFrom) * PPM + 1}px;height:${hgt}px">
        <span class="t">${tiny ? '<b>' + hmE(s.startedAt) + '</b> ' : ''}${esc(s.name)}</span><span class="m">${meta}</span></button>`;
    }
    if (dateKey === today()) {
      const nm = nowMin();
      if (nm >= tlFrom && nm <= END) h += `<div class="nowline" id="nowline" style="top:${(nm - tlFrom) * PPM}px"><span class="nowfish">${SEA.nowFish}</span></div>`;
    }
    h += `<div class="seabed" aria-hidden="true"><span class="weed">${SEA.seaweed}</span><span class="coral">${SEA.coral}</span></div>`;
    [...el.children].forEach(n => { if (!n.classList.contains('swimmers')) n.remove(); });   // 泳いでいる生き物の層は消さない
    el.insertAdjacentHTML('beforeend', h);
    bindDrag();
  }

  /* 予定の長押し移動（15分きざみ）。固定した予定と実績のある予定は動かさない。 */
  function bindDrag() {
    $$('#timeline .blk.plan').forEach(node => {
      const p = planById(node.dataset.plan);
      if (!p || p.fixed || sessionsOfPlan(p.id).length) return;
      let timer = null, startY = 0, active = false, next = p.start;
      node.addEventListener('pointerdown', ev => {
        startY = ev.clientY;
        timer = setTimeout(() => {
          active = true; drag = p.id; node.classList.add('dragging');
          try { node.setPointerCapture(ev.pointerId); } catch (_) { }
          if (navigator.vibrate) navigator.vibrate(18);
        }, 380);
      });
      node.addEventListener('pointermove', ev => {
        if (!active) { if (Math.abs(ev.clientY - startY) > 8) clearTimeout(timer); return; }
        ev.preventDefault();
        next = clamp(Math.round((p.start + (ev.clientY - startY) / PPM) / 15) * 15, tlFrom, END - p.minutes);
        node.style.top = ((next - tlFrom) * PPM + 1) + 'px';
        const m = node.querySelector('[data-meta]'); if (m) m.textContent = `${hm(next)}〜${hm(next + p.minutes)}`;
        const t = node.querySelector('[data-time]'); if (t) t.textContent = hm(next);
      });
      const end = async () => {
        clearTimeout(timer);
        if (!active) return;
        active = false; drag = null; justDragged = true; setTimeout(() => { justDragged = false; }, 350);
        if (next !== p.start) {
          await DB.put('plans', { ...p, start: next, notifyAt: null, userEdited: true });
          await commit(); toast(`予定を ${hm(next)} に移動しました`);
        } else renderTimeline();
      };
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
    });
  }

  /* ---------- 開始・完了・スキップ ---------- */
  async function startPlan(id, source) {
    const r = await DB.startPlan(id, source || 'phone');
    if (!r.ok) { toast(r.reason === 'running' ? '別の計測が進行中です。先に完了してください' : '開始できませんでした'); return false; }
    await commit(); toast('計測を開始しました'); return true;
  }
  async function startCard(id) {
    const r = await DB.startCard(id, 'phone');
    if (!r.ok) { toast(r.reason === 'running' ? '別の計測が進行中です。先に完了してください' : '開始できませんでした'); return; }
    await commit(); toast('計測を開始しました');
  }
  async function finish(source, at, needsCheck) {
    const r = await DB.finishRunning(source || 'phone', at, needsCheck);
    if (!r.ok) return;
    await commit();
    toast(`完了を記録しました（${fmt(sessMin(r.session))}）`);
    if (r.session.unitId && unitById(r.session.unitId) && unitCheckable(unitById(r.session.unitId))) openUnit(r.session.unitId);
  }
  async function skipPlan(id, skipped) {
    await DB.skipPlan(id, skipped);
    await commit(); toast(skipped === false ? 'スキップを戻しました' : 'スキップを記録しました');
  }

  /* 計測したまま予定終了を大きく過ぎていたら、いつ終わったかを確認する（終了し忘れ対策）。 */
  function checkOverdue() {
    const r = runningS();
    if (!r || anySheetOpen()) return;
    const end = plannedEnd(r), now = Date.now();
    if (now < end + OVERDUE_MIN * 60000 || (overdueSnooze[r.id] || 0) > now) return;
    $('#odText').textContent = `「${r.name}」を ${hmE(r.startedAt)} から計測中です。予定の終了は ${hmE(end)} でした。`;
    $('#odPlanned').textContent = `${hmE(end)} に終わったことにする`;
    $('#odNow').onclick = () => { hide('#overdueBack'); finish('phone'); };
    $('#odPlanned').onclick = () => { hide('#overdueBack'); finish('auto', end, true); };
    $('#odKeep').onclick = () => { overdueSnooze[r.id] = Date.now() + OVERDUE_MIN * 60000; hide('#overdueBack'); };
    show('#overdueBack');
  }

  /* ---------- 予定シート ---------- */
  function cardOptions() { return S.cards.map(c => `<option value="${c.id}">${esc(c.name)}（${c.minutes}分）</option>`).join(''); }
  function openPlan(id, min) {
    editPlanId = id; newPlanMin = min;
    const p = id ? planById(id) : null;
    if (id && !p) return;
    $('#planSheetTitle').textContent = p ? '予定を編集' : '予定を追加';
    $('#planCard').innerHTML = cardOptions();
    const unitLinked = !!(p && p.unitId);
    $('#planCardWrap').hidden = unitLinked;
    $('#planUnitName').hidden = !unitLinked;
    if (unitLinked) $('#planUnitName').textContent = p.name;
    const card = p ? cardById(p.cardId) : S.cards[0];
    if (card) $('#planCard').value = card.id;
    $('#planStart').value = hm(p ? p.start : min);
    $('#planMinutes').value = p ? p.minutes : (card ? card.minutes : 60);
    $('#planFixed').checked = !!(p && p.fixed);
    $('#planDelete').hidden = !p || unitLinked;
    $('#planSkip').hidden = !p || sessionsOfPlan(p.id).length > 0;
    $('#planSkip').textContent = p && p.status === 'skipped' ? 'スキップを戻す' : 'スキップ';
    $('#planStartNow').hidden = !p || !!runningS();
    show('#planBack');
  }
  $('#planCard').addEventListener('change', () => {
    if (editPlanId) return;
    const c = cardById($('#planCard').value); if (c) $('#planMinutes').value = c.minutes;
  });
  $('#planForm').addEventListener('submit', async e => {
    e.preventDefault();
    const start = clamp(snap(DB.dayMin($('#planStart').value)), 0, END - 5);
    const minutes = clamp(Number($('#planMinutes').value) || 60, 5, 600);
    const fixed = $('#planFixed').checked;
    if (editPlanId) {
      const p = planById(editPlanId); if (!p) return;
      const next = { ...p, start, minutes, fixed, userEdited: true };
      if (start !== p.start) next.notifyAt = null;
      if (!p.unitId) { const c = cardById($('#planCard').value); if (c) Object.assign(next, { cardId: c.id, name: c.name, category: c.category }); }
      await DB.put('plans', next);
    } else {
      const c = cardById($('#planCard').value); if (!c) return;
      await DB.put('plans', { id: DB.uid('p'), date: dateKey, start, minutes, cardId: c.id, name: c.name, category: c.category, unitId: null, fixed, status: 'active', notifyAt: null, userEdited: true });
    }
    hide('#planBack'); await commit(); toast(editPlanId ? '予定を更新しました' : '予定を追加しました');
  });
  $('#planDelete').onclick = async () => {
    const p = planById(editPlanId); if (!p) return;
    for (const s of sessionsOfPlan(p.id)) await DB.put('sessions', { ...s, planId: null });
    await DB.del('plans', p.id);
    hide('#planBack'); await commit(); toast('予定を削除しました');
  };
  $('#planSkip').onclick = async () => {
    const p = planById(editPlanId); if (!p) return;
    hide('#planBack'); await skipPlan(p.id, p.status === 'skipped' ? false : true);
  };
  $('#planStartNow').onclick = async () => { hide('#planBack'); await startPlan(editPlanId); };

  /* ---------- 実績シート（後からの追加・修正）---------- */
  function openSession(id, min) {
    editSesId = id; newSesMin = min;
    const s = id ? S.sessions.find(x => x.id === id) : null;
    if (id && !s) return;
    const base = s ? s.date : dateKey;
    const plans = plansOf(base);
    if (s && s.planId && !plans.some(p => p.id === s.planId) && planById(s.planId)) plans.push(planById(s.planId));
    $('#sesSheetTitle').textContent = s ? '実績を修正' : '実績を追加';
    $('#sesWhat').innerHTML =
      (plans.length ? `<optgroup label="予定">${plans.map(p => `<option value="p:${p.id}">${hm(p.start)} ${esc(p.name)}</option>`).join('')}</optgroup>` : '') +
      `<optgroup label="カード">${S.cards.map(c => `<option value="c:${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>`;
    if (s) $('#sesWhat').value = s.planId && planById(s.planId) ? 'p:' + s.planId : 'c:' + s.cardId;
    $('#sesStart').value = s ? hmE(s.startedAt) : hm(min);
    $('#sesEnd').value = s ? (s.endedAt == null ? '' : hmE(s.endedAt)) : hm(Math.min(min + 30, END - 1));
    $('#sesEnd').required = !s || s.endedAt != null;
    $('#sesNote').textContent = s && s.endedAt == null ? '終了を空のまま保存すると、計測中のままになります。'
      : s && s.needsCheck ? '予定の終了時刻で自動的に閉じた実績です。実際の時刻に直してください。' : '';
    $('#sesDelete').hidden = !s;
    show('#sesBack');
  }
  $('#sesForm').addEventListener('submit', async e => {
    e.preventDefault();
    const s = editSesId ? S.sessions.find(x => x.id === editSesId) : null;
    const base = s ? s.date : dateKey;
    const startedAt = DB.epochOf(base, DB.dayMin($('#sesStart').value));
    let endedAt = null;
    if ($('#sesEnd').value) {
      endedAt = DB.epochOf(base, DB.dayMin($('#sesEnd').value));
      if (endedAt <= startedAt) endedAt += 24 * 3600000;       // 日付をまたいだ終了
      if (endedAt > Date.now() + 60000) { toast('終了が未来の時刻になっています'); return; }
    }
    if (startedAt > Date.now() + 60000) { toast('開始が未来の時刻になっています'); return; }
    const what = $('#sesWhat').value, rec = {};
    if (what.startsWith('p:')) {
      const p = planById(what.slice(2)); if (!p) return;
      Object.assign(rec, { planId: p.id, unitId: p.unitId || null, cardId: p.cardId, name: p.name, category: p.category });
    } else {
      const c = cardById(what.slice(2)); if (!c) return;
      Object.assign(rec, { planId: null, unitId: null, cardId: c.id, name: c.name, category: c.category });
    }
    const next = s
      ? { ...s, ...rec, startedAt, endedAt, endSource: endedAt == null ? null : 'edited', needsCheck: false }
      : { id: DB.uid('s'), date: base, ...rec, startedAt, endedAt, startSource: 'edited', endSource: 'edited', needsCheck: false, extendMin: 0 };
    await DB.put('sessions', next);
    hide('#sesBack'); await commit(); toast(s ? '実績を修正しました' : '実績を追加しました');
  });
  $('#sesDelete').onclick = async () => {
    if (!editSesId) return;
    await DB.del('sessions', editSesId);
    hide('#sesBack'); await commit(); toast('実績を削除しました');
  };

  /* ---------- 予定なしで開始 ---------- */
  function openPick() {
    if (runningS()) { toast('別の計測が進行中です。先に完了してください'); return; }
    $('#pickList').innerHTML = S.cards.filter(c => c.category !== 'sleep').map(c =>
      `<button data-pick="${c.id}" style="--c:var(--${c.category})">${esc(c.name)}<small>${CATS[c.category]}・標準${c.minutes}分</small></button>`).join('');
    show('#pickBack');
  }
  $('#pickList').addEventListener('click', async e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    hide('#pickBack'); await startCard(b.dataset.pick);
  });

  /* ---------- コマの完了チェック ---------- */
  function openUnit(id) {
    const u = unitById(id); if (!u) return;
    unitSheetId = id;
    $('#unitTitle').textContent = `${u.subj} ${u.title}`;
    $('#unitSub').textContent = `実績 ${fmt(unitActual(u))}／目安 ${u.est}分。終わったものにチェックを付けてください。`;
    $('#unitChecks').innerHTML =
      (u.lec ? `<label class="chk"><input type="checkbox" id="ucLec"${u.lecDone ? ' checked' : ''}>講義</label>` : '') +
      (u.exLabel ? `<label class="chk"><input type="checkbox" id="ucEx"${u.exDone ? ' checked' : ''}>${esc(u.exLabel)}</label>` : '');
    $('#unitMemo').value = u.memo || '';
    show('#unitBack');
  }
  $('#unitSave').onclick = async () => {
    const u = unitById(unitSheetId); if (!u) return;
    await DB.put('units', { ...u, lecDone: $('#ucLec') ? $('#ucLec').checked : u.lecDone, exDone: $('#ucEx') ? $('#ucEx').checked : u.exDone, memo: $('#unitMemo').value });
    hide('#unitBack'); await commit(); toast('コマの記録を保存しました');
  };

  /* ---------- 予定の調整 ---------- */
  const movable = k => plansOf(k).filter(p => !p.fixed && p.status !== 'skipped' && !sessionsOfPlan(p.id).length);
  async function shiftPlans(delta) {
    const list = movable(dateKey);
    if (!list.length) { toast('動かせる予定がありません'); return; }
    undo = { date: dateKey, plans: list.map(p => ({ ...p })) };
    await DB.putMany('plans', list.map(p => ({ ...p, start: clamp(p.start + delta, START, END - p.minutes), notifyAt: null, userEdited: true })));
    await commit(); toast(`${list.length}件を${Math.abs(delta)}分${delta > 0 ? '後ろ' : '前'}へ動かしました`);
  }
  $$('[data-shift]').forEach(b => b.onclick = () => { hide('#adjustBack'); shiftPlans(Number(b.dataset.shift)); });
  $('#reflowBtn').onclick = async () => {
    if (dateKey !== today()) { toast('詰め直しは今日の予定だけです'); return; }
    const list = movable(dateKey);
    if (!list.length) { toast('動かせる予定がありません'); return; }
    undo = { date: dateKey, plans: list.map(p => ({ ...p })) };
    const fixed = plansOf(dateKey).filter(p => p.fixed);
    let cursor = Math.max(START, Math.ceil(nowMin() / 15) * 15);
    const out = [];
    for (const p of list) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const f of fixed) if (cursor < f.start + f.minutes && cursor + p.minutes > f.start) { cursor = f.start + f.minutes + 15; moved = true; }
      }
      out.push({ ...p, start: Math.min(cursor, END - p.minutes), notifyAt: null, userEdited: true });
      cursor += p.minutes + 15;
    }
    await DB.putMany('plans', out);
    hide('#adjustBack'); await commit(); toast('今から15分あけて詰め直しました');
  };
  $('#undoAdjust').onclick = async () => {
    if (!undo || undo.date !== dateKey) { toast('戻せる変更がありません'); return; }
    await DB.putMany('plans', undo.plans); undo = null;
    hide('#adjustBack'); await commit(); toast('動かす前に戻しました');
  };

  /* ---------- この日は無理（コマを後ろへ送る）----------
     決まり：
     - 送るのは学習コマだけ（未完了・実績なし・固定していないもの）。運動などの予定は動かさない。
     - 科目ごとに、講義の順番を保ったまま後ろの枠へ1つずつずらす。
     - 途中に予備の空きがあれば先にそこへ入れ、ずらす範囲を小さくする。
     - 予備が足りない分は、計画の最終日の翌日以降（20:00）に置いて知らせる。
     - 直前の1回は元に戻せる（meta の lastCant に動かす前の予定を残す）。 */
  function planCant(D) {
    const t = today(), nm = nowMin();
    const usable = p => p.date > D && (p.date > t || (p.date === t && p.start > nm));   // これから使える枠
    const cmp = (a, b) => (a.date === b.date ? a.start - b.start : (a.date < b.date ? -1 : 1));
    const after = (a, c) => a.date > c.date || (a.date === c.date && a.start >= c.start + c.minutes);
    const items = S.units.filter(u => u.k !== 'y').map(u => ({ u, p: unitPlan(u) }))
      .filter(x => x.p && !x.p.absorbed && !x.p.fixed && x.p.date >= D && !unitDone(x.u) && !sessionsOfPlan(x.p.id).length)
      .filter(x => !(x.p.status === 'skipped' && usable(x.p)));
    const buffers = S.units.filter(u => u.k === 'y').map(unitPlan)
      .filter(p => p && !p.absorbed && !p.fixed && p.status !== 'skipped' && usable(p) && !sessionsOfPlan(p.id).length)
      .map(p => ({ id: p.id, date: p.date, start: p.start, minutes: p.minutes, changed: false })).sort(cmp);
    let overflowDate = S.units.reduce((m, u) => { const d = uDate(u); return d > m ? d : m; }, D);
    const moves = [];
    for (const k of [...new Set(items.map(x => x.u.k))]) {
      const chain = items.filter(x => x.u.k === k)
        .sort((a, b) => String(a.u.month || '').localeCompare(String(b.u.month || '')) || (a.u.seq || 0) - (b.u.seq || 0));
      if (!chain.some(x => !usable(x.p))) continue;
      const pos = chain.filter(x => usable(x.p)).map(x => ({ date: x.p.date, start: x.p.start, owner: x.u.id })).sort(cmp);
      let pi = 0, cur = { date: D, start: END, minutes: 0 };
      for (const x of chain) {
        const next = pos[pi];
        if (next && next.owner === x.u.id) { pi++; cur = { date: next.date, start: next.start, minutes: x.p.minutes }; continue; }   // 自分の枠のまま
        const buf = buffers.find(b => b.minutes >= x.p.minutes && after(b, cur) && (!next || cmp(b, next) < 0));
        let to, via = 'slot';
        if (buf) { to = { date: buf.date, start: buf.start }; buf.start += x.p.minutes; buf.minutes -= x.p.minutes; buf.changed = true; via = 'buffer'; }
        else if (next) { to = { date: next.date, start: next.start }; pi++; }
        else { overflowDate = addDays(overflowDate > cur.date ? overflowDate : cur.date, 1); to = { date: overflowDate, start: 20 * 60 }; via = 'overflow'; }
        cur = { date: to.date, start: to.start, minutes: x.p.minutes };
        moves.push({ plan: x.p, to, via, displaced: !usable(x.p) });
      }
    }
    moves.sort((a, b) => cmp(a.to, b.to));
    return {
      date: D, moves, buffers: buffers.filter(b => b.changed),
      displaced: moves.filter(m => m.displaced).length, shifted: moves.filter(m => !m.displaced).length,
      overflow: moves.filter(m => m.via === 'overflow')
    };
  }
  let cantPlan = null;
  function openCant() {
    const plan = planCant(dateKey);
    if (!plan.displaced) { toast('この日に送れる学習コマがありません'); return; }
    cantPlan = plan;
    const day = k => `${md(k)}（${wdOf(k)}）`;
    $('#cantTitle').textContent = `${day(dateKey)}のコマを後ろへ送る`;
    $('#cantSummary').textContent = `${plan.displaced}コマを後ろへ送ります。`
      + (plan.shifted ? `続きの${plan.shifted}コマも、順番どおりに1つずつ後ろへずれます。` : '')
      + (plan.buffers.length ? `予備の枠を${plan.buffers.length}つ使います。` : '');
    $('#cantWarn').hidden = !plan.overflow.length;
    if (plan.overflow.length) $('#cantWarn').textContent = `予備が足りないため、${plan.overflow.length}コマは計画の最終日より後（${md(plan.overflow[0].to.date)}以降）に入ります。翌月の計画と重なる場合があります。`;
    $('#cantList').innerHTML = plan.moves.map(m =>
      `<li><b>${esc(m.plan.name)}</b><span>${day(m.plan.date)}${hm(m.plan.start)} → ${day(m.to.date)}${hm(m.to.start)}${m.via === 'buffer' ? '・予備の枠' : m.via === 'overflow' ? '・計画の外' : ''}</span></li>`).join('');
    $('#cantYes').textContent = '後ろへ送る';
    hide('#adjustBack'); show('#cantBack');
  }
  $('#cantBtn').onclick = openCant;

  /* ---------- 進み具合に合わせて組み直す（計画画面のボタン）----------
     遅れているとき：過ぎた日の未完了コマ（積み残し）を、これからの枠へ順番どおりに入れ直す。
                     枠が足りない分は予備の枠を使い、それでも足りなければ計画の外に置いて知らせる。
     進んでいるとき：先に終えたコマの枠が空くので、続きのコマを1つずつ前へ詰める。予備の枠は使わない。
     決まりは「この日は無理」と同じ（学習コマだけ・科目ごと・講義の順番は変えない・直前の1回は元に戻せる）。
     やりかけ（実績がついた）コマと、固定した予定は動かさない。 */
  function planFlow() {
    const t = today(), nm = nowMin();
    const usable = p => p.date > t || (p.date === t && p.start + p.minutes > nm);   // まだ使える枠（今日の分は終了時刻が先なら可）
    const ahead = p => p.date > t || (p.date === t && p.start > nm);                 // これから始まる枠
    const cmp = (a, b) => (a.date === b.date ? a.start - b.start : (a.date < b.date ? -1 : 1));
    const after = (a, c) => a.date > c.date || (a.date === c.date && a.start >= c.start + c.minutes);
    const all = S.units.filter(u => u.k !== 'y' && unitCheckable(u)).map(u => ({ u, p: unitPlan(u) }))
      .filter(x => x.p && !x.p.absorbed && !x.p.early && !x.p.fixed);
    const buffers = S.units.filter(u => u.k === 'y').map(unitPlan)
      .filter(p => p && !p.absorbed && !p.fixed && p.status !== 'skipped' && ahead(p) && !sessionsOfPlan(p.id).length)
      .map(p => ({ id: p.id, date: p.date, start: p.start, minutes: p.minutes, changed: false })).sort(cmp);
    let overflowDate = S.units.reduce((m, u) => { const d = uDate(u); return d > m ? d : m; }, t);
    const moves = [], relocate = [];
    let freed = 0;
    for (const k of [...new Set(all.map(x => x.u.k))]) {
      const chain = all.filter(x => x.u.k === k)
        .sort((a, b) => String(a.u.month || '').localeCompare(String(b.u.month || '')) || (a.u.seq || 0) - (b.u.seq || 0));
      // 先に終えたコマ：これからの枠に残っている予定は、枠を空ける
      const early = chain.filter(x => unitDone(x.u) && ahead(x.p));
      const movers = chain.filter(x => !unitDone(x.u) && !sessionsOfPlan(x.p.id).length && !(x.p.status === 'skipped' && usable(x.p)));
      if (!early.length && !movers.some(x => !usable(x.p))) continue;
      for (const x of early) {
        const ss = sessionsOfPlan(x.p.id).sort((a, b) => a.startedAt - b.startedAt);
        if (ss.length) {            // 計測していたら、実際にやった日時へ予定を合わせる
          const st = clamp(DB.minOn(ss[0].date, ss[0].startedAt), 0, END - x.p.minutes);
          relocate.push({ plan: x.p, to: { date: ss[0].date, start: st }, early: false });
        } else relocate.push({ plan: x.p, to: { date: t, start: x.p.start }, early: true });
      }
      const pos = [
        ...movers.filter(x => usable(x.p)).map(x => ({ date: x.p.date, start: x.p.start, owner: x.u.id })),
        ...early.map(x => ({ date: x.p.date, start: x.p.start, owner: null }))
      ].sort(cmp);
      let pi = 0, cur = { date: t, start: nm, minutes: 0 };
      movers.forEach((x, i) => {
        const next = pos[pi], short = movers.length - i > pos.length - pi;
        if (next && next.owner === x.u.id) { pi++; cur = { date: next.date, start: next.start, minutes: x.p.minutes }; return; }   // 自分の枠のまま
        const buf = short ? buffers.find(b => b.minutes >= x.p.minutes && after(b, cur) && (!next || cmp(b, next) < 0)) : null;
        let to, via = 'slot';
        if (buf) { to = { date: buf.date, start: buf.start }; buf.start += x.p.minutes; buf.minutes -= x.p.minutes; buf.changed = true; via = 'buffer'; }
        else if (next) { to = { date: next.date, start: next.start }; pi++; }
        else { overflowDate = addDays(overflowDate > cur.date ? overflowDate : cur.date, 1); to = { date: overflowDate, start: 20 * 60 }; via = 'overflow'; }
        cur = { date: to.date, start: to.start, minutes: x.p.minutes };
        moves.push({ plan: x.p, to, via, displaced: !usable(x.p), earlier: cmp(to, x.p) < 0 });
      });
      freed += pos.length - pi;
    }
    // コマの長さが枠の持ち主と違っても重ならないよう、同じ日の中で後ろへ寄せる
    const dest = new Map(moves.map(m => [m.plan.id, m]));
    const gone = new Set(relocate.map(r => r.plan.id));
    const used = new Map(buffers.filter(b => b.changed).map(b => [b.id, b]));      // 使った予備は、縮めたあとの時刻で見る
    for (const d of [...new Set(moves.map(m => m.to.date))]) {
      const day = S.plans.filter(p => p.category === 'study' && !p.absorbed && !p.early && !gone.has(p.id) && p.status !== 'skipped'
        && !(used.has(p.id) && used.get(p.id).minutes < 30)
        && (dest.has(p.id) ? dest.get(p.id).to.date === d : p.date === d))
        .map(p => {
          const m = dest.get(p.id), b = used.get(p.id);
          return { m, start: m ? m.to.start : b ? b.start : p.start, minutes: b ? b.minutes : p.minutes };
        })
        .sort((a, b) => a.start - b.start || (a.m ? 1 : -1));
      let end = 0;
      for (const x of day) {
        if (x.m && x.start < end) { x.start = Math.min(end, END - x.minutes); x.m.to.start = x.start; }
        end = Math.max(end, x.start + x.minutes);
      }
    }
    moves.sort((a, b) => cmp(a.to, b.to));
    return {
      kind: 'flow', date: t, moves, relocate, buffers: buffers.filter(b => b.changed), freed,
      displaced: moves.filter(m => m.displaced).length, shifted: moves.filter(m => !m.displaced && !m.earlier).length,
      pulled: moves.filter(m => m.earlier).length, overflow: moves.filter(m => m.via === 'overflow')
    };
  }
  function openFlow() {
    const plan = planFlow();
    if (!plan.moves.length) { toast('組み直すコマがありません'); return; }
    cantPlan = plan;
    const day = k => `${md(k)}（${wdOf(k)}）`;
    $('#cantTitle').textContent = '進み具合に合わせて組み直す';
    $('#cantSummary').textContent =
      (plan.displaced ? `積み残しの${plan.displaced}コマを、これからの枠へ入れ直します。` : '')
      + (plan.shifted ? `続きの${plan.shifted}コマは、順番どおりに1つずつ後ろへずれます。` : '')
      + (plan.pulled ? `先に終えたコマの分、${plan.pulled}コマを前へ詰めます。` : '')
      + (plan.buffers.length ? `予備の枠を${plan.buffers.length}つ使います。` : '')
      + (plan.freed ? `いちばん後ろに${plan.freed}コマ分の空きができます。` : '');
    $('#cantWarn').hidden = !plan.overflow.length;
    if (plan.overflow.length) $('#cantWarn').textContent = `予備が足りないため、${plan.overflow.length}コマは計画の最終日より後（${md(plan.overflow[0].to.date)}以降）に入ります。翌月の計画と重なる場合があります。`;
    $('#cantList').innerHTML = plan.moves.map(m =>
      `<li><b>${esc(m.plan.name)}</b><span>${day(m.plan.date)}${hm(m.plan.start)} → ${day(m.to.date)}${hm(m.to.start)}${m.via === 'buffer' ? '・予備の枠' : m.via === 'overflow' ? '・計画の外' : m.earlier ? '・前倒し' : ''}</span></li>`).join('');
    $('#cantYes').textContent = '組み直す';
    show('#cantBack');
  }
  async function undoLast() {
    const last = S.meta.lastCant;
    if (!last || !Array.isArray(last.plans)) return;
    const moved = new Set(last.moved || last.plans.map(o => o.id));
    if (last.plans.some(o => moved.has(o.id) && sessionsOfPlan(o.id).length > (o.sessionCount || 0))) { toast('組み直したあとに実績がついたコマがあるため、戻せません'); return; }
    await DB.putMany('plans', last.plans.map(({ sessionCount, ...o }) => o));
    await DB.setMeta('lastCant', null);
    hide('#adjustBack'); await commit(); toast(last.kind === 'flow' ? '組み直す前の予定に戻しました' : '送る前の予定に戻しました');
  }
  $('#cantNo').onclick = () => { cantPlan = null; hide('#cantBack'); };
  $('#cantYes').onclick = async () => {
    const plan = cantPlan; if (!plan) return;
    cantPlan = null;
    const before = [], next = [];
    for (const m of plan.moves) {
      before.push({ ...m.plan });
      next.push({ ...m.plan, date: m.to.date, start: m.to.start, status: 'active', notifyAt: null, userEdited: true });
    }
    for (const b of plan.buffers) {
      const p = planById(b.id); if (!p) continue;
      before.push({ ...p });
      next.push({ ...p, start: b.start, minutes: b.minutes, absorbed: b.minutes < 30, notifyAt: null, userEdited: true });
    }
    for (const r of plan.relocate || []) {       // 先に終えたコマの予定（組み直しのときだけ）
      before.push({ ...r.plan, sessionCount: sessionsOfPlan(r.plan.id).length });
      next.push({ ...r.plan, date: r.to.date, start: r.to.start, early: r.early, notifyAt: null, userEdited: true });
    }
    await DB.putMany('plans', next);
    await DB.setMeta('lastCant', { at: Date.now(), date: plan.date, kind: plan.kind || 'cant', plans: before, moved: plan.moves.map(m => m.plan.id) });
    hide('#cantBack'); await commit(); toast(`${plan.moves.length}コマを組み直しました`);
  };
  $('#undoCant').onclick = undoLast;
  const undoLabel = last => (last.kind === 'flow' ? '組み直しを元に戻す' : `送ったコマを元に戻す（${md(last.date)}の分）`);
  function openAdjust() {
    const last = S.meta.lastCant, b = $('#undoCant');
    b.hidden = !last;
    if (last) b.textContent = undoLabel(last);
    show('#adjustBack');
  }

  /* ---------- 振り返り ---------- */
  const face = n => (n === 3 ? '😄' : n === 2 ? '🙂' : n === 1 ? '😕' : '—');
  function renderReviewMini() {
    const r = S.reviews.find(x => x.date === dateKey);
    $('#reviewMini').innerHTML = r ? `<div class="review"><div>勉強 ${face(r.study)}</div><div>運動 ${face(r.exercise)}</div><div>睡眠 ${face(r.sleep)}${r.sleepHours ? ' ' + r.sleepHours + 'h' : ''}</div></div>` : '';
  }
  function openReview() {
    const r = S.reviews.find(x => x.date === dateKey) || {};
    reviewDraft = { study: r.study || 0, exercise: r.exercise || 0, sleep: r.sleep || 0 };
    $('#sleepHours').value = r.sleepHours || ''; $('#reviewNote').value = r.note || '';
    $$('.moodrow').forEach(row => row.querySelectorAll('[data-score]').forEach(b => b.classList.toggle('on', Number(b.dataset.score) === reviewDraft[row.dataset.review])));
    show('#reviewBack');
  }
  $$('.moodrow').forEach(row => row.addEventListener('click', e => {
    const b = e.target.closest('[data-score]'); if (!b) return;
    reviewDraft[row.dataset.review] = Number(b.dataset.score);
    row.querySelectorAll('[data-score]').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#saveReview').onclick = async () => {
    await DB.put('reviews', { date: dateKey, ...reviewDraft, sleepHours: Number($('#sleepHours').value) || 0, note: $('#reviewNote').value.trim() });
    hide('#reviewBack'); await commit(); toast('振り返りを保存しました');
  };
  $('#clearReview').onclick = async () => { await DB.del('reviews', dateKey); hide('#reviewBack'); await commit(); toast('振り返りを消しました'); };

  /* ---------- 計画 ---------- */
  function renderPlan() {
    const metas = monthMetas(), meta = metas[metas.length - 1];
    const units = S.units.filter(u => { const p = unitPlan(u); return !(p && p.absorbed); })
      .sort((a, b) => uDate(a).localeCompare(uDate(b)) || uStart(a) - uStart(b) || (a.seq || 0) - (b.seq || 0));
    const t = today();
    if (meta && meta.exam) {
      const left = Math.max(0, Math.round((DB.keyToDate(meta.exam) - DB.keyToDate(t)) / 86400000));
      $('#planSub').innerHTML = `${esc(meta.label)}の計画　${esc(meta.examLabel || '試験')}（${meta.exam.replace(/-/g, '/')}）まであと <b>${left}</b> 日`;
    } else $('#planSub').textContent = '計画データがまだありません。通信できる場所で開き直してください。';

    const lecT = units.filter(u => u.lec), exT = units.filter(u => u.exLabel);
    const lecD = lecT.filter(u => u.lecDone).length, exD = exT.filter(u => u.exDone).length;
    const act = units.reduce((a, u) => a + unitActual(u), 0), est = units.reduce((a, u) => a + u.est, 0);
    const pct = (a, b) => (b ? Math.min(100, 100 * a / b) : 0);
    // 進み具合を水位で見せる（タイルの下から水がたまる）
    const tile = (label, main, p) => `<div class="tile water${p > 0 ? '' : ' dry'}" style="--p:${Math.round(p)}"><span>${label}</span><b>${main}</b></div>`;
    $('#planTiles').innerHTML =
      tile('講義', `${lecD}<small> / ${lecT.length}コマ</small>`, pct(lecD, lecT.length)) +
      tile('演習・復習', `${exD}<small> / ${exT.length}コマ</small>`, pct(exD, exT.length)) +
      tile('実績', `${hours(act)}<small> / ${hours(est)}時間</small>`, pct(act, est));

    const backlog = units.filter(u => uDate(u) < t && unitCheckable(u) && !unitDone(u)).length;
    const limit = (meta && meta.backlogLimit) || 4;
    const flow = planFlow(), last = S.meta.lastCant;
    const flowBtn = flow.moves.length ? `<button class="btn primary" id="flowBtn">${flow.displaced ? '組み直す' : '前に詰める'}</button>` : '';
    const undoBtn = last ? `<button class="btn ghost" id="flowUndo">${undoLabel(last)}</button>` : '';
    const text = backlog > limit ? `積み残しが${backlog}コマあります。新しい講義を止めて、回収を優先してください。`
      : backlog > 0 ? `積み残し ${backlog}コマ（${limit}コマを超えたら回収を優先）`
        : (flow.pulled ? `先に終えたコマがあります。続きの${flow.pulled}コマを前へ詰められます。` : (last ? '予定を組み直しました。' : ''));
    $('#backlog').innerHTML = text ? `<div class="notice flowbar${backlog > limit ? ' warn' : ''}"><span>${text}</span>${flowBtn}${undoBtn}</div>` : '';

    $$('#planTabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === planFilter ? 'true' : 'false'));
    const shown = units.filter(u => planFilter === 'today' ? uDate(u) === t : planFilter === 'open' ? (unitCheckable(u) && !unitDone(u)) : true);
    const run = runningS();
    const byDate = new Map();
    shown.forEach(u => { const k = uDate(u); if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push(u); });
    let h = '';
    for (const [d, list] of byDate) {
      const dd = DB.keyToDate(d), all = units.filter(u => uDate(u) === d && unitCheckable(u));
      const doneN = all.filter(unitDone).length;
      h += `<section class="pday${d === t ? ' today' : ''}"><div class="rail"><span class="d">${md(d)}</span><span class="w">${WD[dd.getDay()]}曜日</span>${d === t ? '<span class="badge">今日</span>' : ''}<span class="c">${all.length ? `完了 ${doneN}/${all.length}` : '予備日'}</span></div><div>`;
      for (const u of list) {
        const p = planById('u-' + u.id), done = unitDone(u), isRun = run && run.unitId === u.id;
        const measured = unitMeasured(u);
        h += `<div class="unit${done ? ' done' : ''}" data-uid="${u.id}">
          <div class="head"><span class="pill ${u.k}">${esc(u.subj)}</span><span class="ttl">${esc(u.title)}</span></div>
          ${p ? `<div class="time">${hm(p.start)}〜${hm(p.start + p.minutes)}${p.status === 'skipped' ? '・スキップ' : ''}${p.date !== u.date ? `・${md(u.date)}から移動` : ''}</div>` : ''}
          ${unitCheckable(u) ? `<div class="checks">
            ${u.lec ? `<label class="chk"><input type="checkbox" data-ucheck="lecDone"${u.lecDone ? ' checked' : ''}>講義</label>` : ''}
            ${u.exLabel ? `<label class="chk"><input type="checkbox" data-ucheck="exDone"${u.exDone ? ' checked' : ''}>${esc(u.exLabel)}</label>` : ''}</div>` : ''}
          <div class="actual"><span>実績 <b>${fmt(unitActual(u))}</b>／目安${u.est}分${u.manualMin != null ? '（手入力）' : ''}</span>
            ${isRun ? '<span class="late" style="margin-left:auto;color:var(--shu);font-weight:700">計測中</span>' : (!run && !done && p ? `<button class="btn" data-ustart="${p.id}">開始</button>` : '')}</div>
          <p class="note">${esc(u.note || '')}</p>
          <details data-memo="${u.id}"${openMemos.has(u.id) ? ' open' : ''}><summary>${u.memo ? 'メモあり' : 'メモ・手入力'}</summary><div class="inner">
            <textarea data-umemo placeholder="つまずいた論点、間違えた問題番号など">${esc(u.memo || '')}</textarea>
            <label class="mini">計測しなかった日の実績 <input type="number" inputmode="numeric" min="0" max="900" step="5" data-umanual value="${u.manualMin != null ? u.manualMin : ''}" placeholder="${measured}"> 分</label>
          </div></details></div>`;
      }
      h += '</div></section>';
    }
    $('#planDays').innerHTML = h || `<div class="empty"><span class="mate">${SEA.whale}</span><p>${planFilter === 'today' ? '今日のコマはありません。' : planFilter === 'open' ? '未完了のコマはありません。' : '計画データがまだありません。'}</p></div>`;

    const rules = (meta && meta.rules) || [];
    $('#planRules').hidden = !rules.length;
    $('#planRules').innerHTML = `<summary>運用ルール</summary><ul>${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
  }
  $('#backlog').addEventListener('click', e => {
    if (e.target.id === 'flowBtn') openFlow();
    else if (e.target.id === 'flowUndo') undoLast();
  });
  $('#planTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; planFilter = b.dataset.f; renderPlan(); });
  $('#planDays').addEventListener('toggle', e => {
    const d = e.target.closest('[data-memo]'); if (!d) return;
    d.open ? openMemos.add(d.dataset.memo) : openMemos.delete(d.dataset.memo);
  }, true);
  $('#planDays').addEventListener('change', async e => {
    const box = e.target.closest('[data-uid]'); if (!box) return;
    const u = unitById(box.dataset.uid); if (!u) return;
    const t = e.target;
    if (t.dataset.ucheck) await DB.put('units', { ...u, [t.dataset.ucheck]: t.checked });
    else if (t.hasAttribute('data-umemo')) await DB.put('units', { ...u, memo: t.value });
    else if (t.hasAttribute('data-umanual')) {
      const v = t.value.trim() === '' ? null : clamp(Math.round(Number(t.value)) || 0, 0, 900);
      await DB.put('units', { ...u, manualMin: v });
    } else return;
    await commit();
  });
  $('#planDays').addEventListener('click', async e => {
    const b = e.target.closest('[data-ustart]'); if (!b) return;
    if (await startPlan(b.dataset.ustart)) { dateKey = today(); switchView('day'); }
  });

  /* ---------- 週次 ---------- */
  function renderWeek() {
    const ws = weekStart(weekKey), days = [...Array(7)].map((_, i) => addDays(ws, i)), t = today(), nm = nowMin();
    $('#weekTitle').textContent = `${md(days[0])}〜${md(days[6])}`;
    const inWeek = k => k >= days[0] && k <= days[6];
    const sPlans = S.plans.filter(p => inWeek(p.date) && p.category === 'study' && !p.absorbed);
    const sSes = S.sessions.filter(s => inWeek(s.date) && s.category === 'study');
    const planMin = sPlans.reduce((a, p) => a + p.minutes, 0), actMin = sSes.reduce((a, s) => a + sessMin(s), 0);

    // 開始遅れ：予定と同じ日に始めた最初の実績と、予定の開始時刻との差。
    const delays = [];
    let unstarted = 0, skipped = 0;
    for (const p of sPlans) {
      const first = sessionsOfPlan(p.id).filter(s => s.date === p.date).sort((a, b) => a.startedAt - b.startedAt)[0];
      if (first) { delays.push(Math.round((first.startedAt - DB.epochOf(p.date, p.start)) / 60000)); continue; }
      if (p.status === 'skipped') { skipped++; continue; }
      const u = p.unitId && unitById(p.unitId);
      if (u && unitDone(u)) continue;
      if (sessionsOfPlan(p.id).length) continue;
      if (p.date < t || (p.date === t && p.start + p.minutes < nm)) unstarted++;
    }
    const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
    const wUnits = S.units.filter(u => inWeek(uDate(u)) && unitCheckable(u)), wDone = wUnits.filter(unitDone).length;
    const pct = planMin ? Math.round(100 * actMin / planMin) : 0;

    let h = `<div class="wk-tiles">
      <div class="tile full"><span>勉強の実績／予定</span><b>${fmt(actMin)}<small> / ${fmt(planMin)}（${pct}%）</small></b>
        <div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>
        <span>週の学習枠 ${hours(TARGET_WEEK_MIN)}時間に対して ${Math.round(100 * actMin / TARGET_WEEK_MIN)}%</span></div>
      <div class="tile"><span>開始の遅れ（平均）</span><b>${avg == null ? '—' : (avg > 0 ? '+' : '') + avg + '分'}</b><span>${delays.length ? delays.length + '回の計測から' : 'まだ計測がありません'}</span></div>
      <div class="tile"><span>完了したコマ</span><b>${wDone}<small> / ${wUnits.length}</small></b><span>未着手 ${unstarted}・スキップ ${skipped}</span></div>
    </div>`;

    const rows = days.map(k => ({
      k,
      p: S.plans.filter(p => p.date === k && p.category === 'study' && !p.absorbed).reduce((a, p) => a + p.minutes, 0),
      a: S.sessions.filter(s => s.date === k && s.category === 'study').reduce((a, s) => a + sessMin(s), 0)
    }));
    const mx = Math.max(1, ...rows.map(r => Math.max(r.p, r.a)));
    h += `<h2 class="sec">日ごとの勉強</h2><div class="box"><div class="legend"><span><i class="p"></i>予定</span><span><i class="a"></i>実績</span></div>` +
      rows.map(r => `<div class="dayrow"><span>${md(r.k)}（${WD[DB.keyToDate(r.k).getDay()]}）</span>
        <div class="bars"><div class="b p" style="width:${Math.max(r.p ? 2 : 0, 100 * r.p / mx)}%;${r.p ? '' : 'visibility:hidden'}"></div><div class="b a" style="width:${100 * r.a / mx}%"></div></div>
        <span class="n"><b>${hours(r.a)}</b> / ${hours(r.p)}h</span></div>`).join('') + '</div>';

    const needs = S.sessions.filter(s => s.needsCheck).sort((a, b) => b.startedAt - a.startedAt);
    if (needs.length) {
      h += `<h2 class="sec">時刻の確認が必要な実績</h2><div class="box">` +
        needs.map(s => `<div class="listrow"><div class="grow"><b>${esc(s.name)}</b><div class="sub">${md(s.date)} ${hmE(s.startedAt)}〜${hmE(s.endedAt)}（予定の終了時刻で閉じた）</div></div><button class="btn" data-fix="${s.id}">直す</button></div>`).join('') + '</div>';
    }

    const by = {}; S.sessions.filter(s => inWeek(s.date)).forEach(s => { by[s.category] = (by[s.category] || 0) + sessMin(s); });
    const cmx = Math.max(1, ...Object.values(by));
    h += `<h2 class="sec">カテゴリ別の実績</h2><div class="box">` +
      Object.keys(CATS).map(c => `<div class="catrow" style="--c:var(--${c})"><span>${CATS[c]}</span><div class="bar"><i style="width:${100 * (by[c] || 0) / cmx}%"></i></div><b>${fmt(by[c] || 0)}</b></div>`).join('') + '</div>';

    const revs = S.reviews.filter(r => inWeek(r.date)).sort((a, b) => a.date.localeCompare(b.date));
    if (revs.length) {
      h += `<h2 class="sec">振り返り</h2><div class="box">` +
        revs.map(r => `<div class="listrow"><div class="grow"><b>${md(r.date)}</b>　勉強 ${face(r.study)}　運動 ${face(r.exercise)}　睡眠 ${face(r.sleep)}${r.sleepHours ? ' ' + r.sleepHours + 'h' : ''}${r.note ? `<div class="sub">${esc(r.note)}</div>` : ''}</div></div>`).join('') + '</div>';
    }
    $('#weekBody').innerHTML = h;
  }
  $('#weekBody').addEventListener('click', e => {
    const b = e.target.closest('[data-fix]'); if (!b) return;
    const s = S.sessions.find(x => x.id === b.dataset.fix); if (!s) return;
    openSession(s.id);
  });
  $('#prevWeek').onclick = () => { weekKey = addDays(weekKey, -7); renderWeek(); };
  $('#nextWeek').onclick = () => { weekKey = addDays(weekKey, 7); renderWeek(); };

  /* ---------- 設定 ---------- */
  /* ---------- 通知の診断（Androidアプリ 2.0.4 以降）----------
     通知が来ないときに、どこで止まっているかを画面で見られるようにする。 */
  const BUCKETS = { 5: '除外', 10: '使用中', 20: 'よく使う', 30: 'ときどき', 40: 'まれ', 45: '制限', 50: '使わない' };
  const when = t => {
    if (!t) return 'まだありません';
    const d = new Date(t), k = DB.dateKey(d);
    return `${k === DB.dateKey(new Date()) ? '今日' : md(k)} ${hm(d.getHours() * 60 + d.getMinutes())}`;
  };
  function diagBox() {
    const n = window.DayFlowNative;
    if (!n) return '';
    if (!n.diagnose) return `<h2 class="sec">通知の診断</h2><div class="box"><p class="sub">いまのAndroidアプリには診断の機能がありません。新しい dayflow.apk を入れ直すと使えます。</p></div>`;
    let d = {};
    try { d = JSON.parse(n.diagnose() || '{}'); } catch (_) { d = {}; }
    const ok = (good, text, bad) => `<li class="${good ? 'ok' : 'ng'}"><span>${good ? '○' : '×'}</span>${good ? text : `<b>${bad}</b>`}</li>`;
    const ch = d.channelStart;
    const rows = [
      ok(d.notifications, '通知：許可済み', '通知：未許可。下の「通知の設定」でオンにしてください'),
      ok(ch === undefined || ch >= 3, '開始の通知：オン', ch === 0 ? '開始の通知：オフになっています。「通知の設定」でオンにしてください' : '開始の通知：音やポップアップが出ない設定です。「通知の設定」で重要度を上げてください'),
      ok(d.exactAlarms, '時刻どおりの通知：可', '時刻どおりの通知：不可（数分〜大きく遅れます）。「アラームの許可」をオンにしてください'),
      ok(d.batteryExempt, '電池の最適化：対象外', '電池の最適化：対象（予約が止められることがあります）。「電池の最適化を外す」を押してください'),
      ok(!d.bgRestricted, 'バックグラウンド：制限なし', 'バックグラウンド：制限されています。「アプリ情報」の電池の項目で制限を外してください'),
      ok(d.alarms > 0, `予約中の通知：${d.alarms}件（次：${d.nextAt ? `${when(d.nextAt)} ${esc(d.nextName || '')}` : 'なし'}）`, '予約中の通知：0件（予定が通知に渡っていません）')
    ];
    const test = d.testRequestedAt
      ? (d.testFiredAt >= d.testRequestedAt
        ? `最後のテスト：${when(d.testRequestedAt)}に予約 → ${when(d.testFiredAt)}に通知${d.testAckAt >= d.testFiredAt ? ' → ［受け取った］が押された' : ''}`
        : (Date.now() > d.testDueAt + 60000 ? `<b style="color:var(--shu)">最後のテスト：${when(d.testDueAt)}の予定が、まだ通知されていません</b>` : `テスト通知を待っています（${when(d.testDueAt)}の予定）`))
      : 'テストはまだしていません';
    return `
      <h2 class="sec">通知の診断</h2>
      <div class="box">
        <ul class="diag">${rows.join('')}</ul>
        <p class="sub">予定表を受け取った時刻：${when(d.scheduleAt)}${d.scheduleCount !== undefined && d.scheduleCount !== '' ? `（${esc(String(d.scheduleCount))}件）` : ''}<br>最後に予定の通知を出した時刻：${when(d.lastFiredAt)}${d.lastFiredName ? ` ${esc(d.lastFiredName)}` : ''}<br>${test}</p>
        <div class="choices">
          <button data-test="10">10秒後にテスト</button>
          <button data-test="300">5分後にテスト</button>
          <button data-open="notifications">通知の設定</button>
          <button data-open="battery">電池の最適化を外す</button>
          <button data-open="alarms">アラームの許可</button>
          <button data-open="app">アプリ情報</button>
        </div>
        <p class="sub">テストは、押したらすぐスマホの画面を消して待ってください。5分後のほうが、実際の予定の通知に近い条件です。<br>端末：${esc(`${d.maker || ''} ${d.model || ''}`.trim())}／Android API ${d.sdk || '?'}／アプリ ${esc(d.version || '')}／待機の区分：${BUCKETS[d.bucket] || d.bucket || '?'}</p>
      </div>`;
  }

  const SEA_MODES = [['auto', '端末に合わせる'], ['light', '明るい海'], ['deep', '深い海'], ['progress', '進み具合で変わる']];
  const SEA_NAMES = { light: '明るい海', mid: '少し潜った海', deep: '深い海' };
  function seaNote() {
    if (!THEME) return '';
    const m = THEME.mode();
    if (m === 'auto') return 'スマホの「明るい表示／暗い表示」に合わせます。';
    if (m !== 'progress') return `いつも${SEA_NAMES[m]}で表示します。`;
    const g = progress();
    const why = g.outside ? `計画の期間からはみ出したコマが${g.outside}つ` : g.backlog ? `積み残し${g.backlog}コマ` : '積み残しなし';
    return `いまは「${SEA_NAMES[g.level]}」（${why}）。積み残しがなければ明るい海、あると少し潜り、${g.limit}コマを超えるか計画からはみ出すと深い海になります。`;
  }
  function renderSettings() {
    const last = S.meta.lastExport, cats = notifyCats(), metas = monthMetas();
    const native = !!(window.DayFlowNative && window.DayFlowNative.replaceSchedule);
    let st = null;
    try { st = native && window.DayFlowNative.status ? JSON.parse(window.DayFlowNative.status()) : null; } catch (_) { st = null; }
    const nativeLine = !native ? 'このブラウザでは未検出（通知はAndroidアプリから開いたときだけ届きます）'
      : !st ? '検出しました（予定を通知に渡しています）'
        : `アプリ ${esc(st.version || '')}／通知 ${st.notifications ? '許可済み' : '<b style="color:var(--shu)">未許可（スマホの設定でDayFlowの通知をオンにしてください）</b>'}／時刻どおりの通知 ${st.exactAlarms ? '可' : '<b style="color:var(--shu)">不可（数分ずれることがあります）</b>'}`;
    $('#settingsBody').innerHTML = `
      <h2 class="sec" style="margin-top:4px">カード</h2>
      <div class="box">${S.cards.map(c => `<div class="setrow"><div class="grow"><b><span class="dot" style="--c:var(--${c.category})"></span>${esc(c.name)}</b><div class="sub">${CATS[c.category]}・標準${c.minutes}分</div></div><button class="btn" data-editcard="${c.id}">編集</button></div>`).join('')}
        <div class="setrow"><button class="btn wide" id="addCard">カードを追加</button></div></div>

      <h2 class="sec">通知するカテゴリ</h2>
      <div class="box">
        <div class="checks">${Object.keys(CATS).map(c => `<label class="chk"><input type="checkbox" data-ncat="${c}"${cats.includes(c) ? ' checked' : ''}>${CATS[c]}</label>`).join('')}</div>
        <p class="sub">Androidアプリとの連携：${nativeLine}</p>
      </div>
${diagBox()}

      <h2 class="sec">海の明るさ</h2>
      <div class="box">
        <div class="choices" role="group" aria-label="海の明るさ">${SEA_MODES.map(([m, label]) => `<button data-sea-mode="${m}" aria-pressed="${THEME && THEME.mode() === m ? 'true' : 'false'}">${label}</button>`).join('')}</div>
        <p class="sub">${seaNote()}</p>
      </div>

      <h2 class="sec">バックアップ</h2>
      <div class="box">
        <p class="sub">最後の書き出し：${last ? new Date(last).toLocaleString('ja-JP') : 'まだありません'}。記録はこの端末の中だけにあるので、週に1回は書き出してください。</p>
        <div class="actions"><button class="btn" id="exportBtn">書き出す</button><button class="btn" id="importBtn">読み込む</button></div>
      </div>

      <h2 class="sec">このアプリ</h2>
      <div class="box"><p class="sub">DayFlow ${APP_VERSION}／計画データ：${metas.length ? metas.map(m => `${m.month}（v${m.version}）`).join('、') : '未取り込み'}</p></div>`;
  }
  $('#settingsBody').addEventListener('click', async e => {
    const ed = e.target.closest('[data-editcard]');
    if (ed) { openCard(ed.dataset.editcard); return; }
    if (e.target.id === 'addCard') { openCard(null); return; }
    if (e.target.id === 'exportBtn') { await doExport(); return; }
    if (e.target.id === 'importBtn') { $('#importFile').value = ''; $('#importFile').click(); }
    const tb = e.target.closest('[data-test]'), ob = e.target.closest('[data-open]'), n = window.DayFlowNative;
    if (tb && n && n.testNotify) {
      const sec = Number(tb.dataset.test);
      n.testNotify(sec); renderSettings();
      toast(sec >= 60 ? `${sec / 60}分後にテスト通知を出します。画面を消して待ってください` : `${sec}秒後にテスト通知を出します。画面を消して待ってください`);
      return;
    }
    if (ob && n && n.openSettings) { if (!n.openSettings(ob.dataset.open)) toast('設定画面を開けませんでした'); return; }
    const sm = e.target.closest('[data-sea-mode]');
    if (sm && THEME) { THEME.setMode(sm.dataset.seaMode); THEME.setLevel(progress().level); syncBars(); renderSettings(); }
  });
  $('#settingsBody').addEventListener('change', async e => {
    if (!e.target.dataset.ncat) return;
    const cats = $$('[data-ncat]').filter(x => x.checked).map(x => x.dataset.ncat);
    await DB.setMeta('notifyCats', cats); await commit();
  });
  async function doExport() {
    const data = await DB.exportAll();
    const n = window.DayFlowNative;
    if (n && n.saveFile) {
      const where = n.saveFile(`dayflow-backup-${today()}.json`, JSON.stringify(data));
      if (!where) { toast('書き出しに失敗しました'); return; }
      await DB.setMeta('lastExport', Date.now()); await commit(); toast(`${where} に書き出しました`); return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `dayflow-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    await DB.setMeta('lastExport', Date.now()); await commit(); toast('書き出しました');
  }
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (_) { toast('ファイルを読めませんでした'); return; }
    if (!data || data.app !== 'dayflow') { toast('DayFlowの書き出しファイルではありません'); return; }
    const ok = await confirmSheet(`${String(data.exportedAt || '').slice(0, 10)} に書き出した記録で、いまの記録をすべて置き換えます。`, '置き換える');
    if (!ok) return;
    try { await DB.importAll(data); await commit(); toast('読み込みました'); } catch (err) { toast(err.message || '読み込みに失敗しました'); }
  });

  function openCard(id) {
    editCardId = id;
    const c = id ? cardById(id) : null;
    $('#cardSheetTitle').textContent = c ? 'カードを編集' : 'カードを追加';
    $('#cardCategory').innerHTML = Object.keys(CATS).map(k => `<option value="${k}">${CATS[k]}</option>`).join('');
    $('#cardName').value = c ? c.name : ''; $('#cardCategory').value = c ? c.category : 'study'; $('#cardMinutes').value = c ? c.minutes : 60;
    $('#cardDelete').hidden = !c;
    show('#cardBack');
  }
  $('#cardForm').addEventListener('submit', async e => {
    e.preventDefault();
    const rec = { name: $('#cardName').value.trim(), category: $('#cardCategory').value, minutes: clamp(Number($('#cardMinutes').value) || 60, 5, 600) };
    if (!rec.name) return;
    const c = editCardId ? cardById(editCardId) : null;
    await DB.put('cards', c ? { ...c, ...rec } : { id: DB.uid('c'), order: S.cards.length, ...rec });
    hide('#cardBack'); await commit(); toast('カードを保存しました');
  });
  $('#cardDelete').onclick = async () => {
    if (!editCardId) return;
    if (S.plans.some(p => p.cardId === editCardId) || S.sessions.some(s => s.cardId === editCardId)) { toast('予定か実績で使っているカードは削除できません'); return; }
    await DB.del('cards', editCardId); hide('#cardBack'); await commit(); toast('カードを削除しました');
  };

  /* ---------- 画面の切り替えと操作 ---------- */
  function switchView(v) {
    view = v;
    $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.nav === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.dataset.view === v));
    if (v === 'week') weekKey = dateKey;
    renderAll(); window.scrollTo(0, 0);
    if (v === 'day') scrollToNow();
  }
  $$('.tabbar button').forEach(b => b.onclick = () => switchView(b.dataset.nav));
  function scrollToNow() {
    const n = $('#nowline'); if (!n || dateKey !== today()) return;
    const y = n.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.55;
    if (y > 0 && runningS()) window.scrollTo(0, y);
  }
  $('#prevDay').onclick = () => { dateKey = addDays(dateKey, -1); renderDay(); };
  $('#nextDay').onclick = () => { dateKey = addDays(dateKey, 1); renderDay(); };
  $('#todayBtn').onclick = () => { dateKey = today(); renderDay(); };
  $('#tlToggle').onclick = () => { tlFull = !tlFull; renderTimeline(); };
  $('#pickBtn').onclick = openPick;
  $('#adjustBtn').onclick = openAdjust;
  $('#reviewBtn').onclick = openReview;
  $('#nowCard').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'finish') finish('phone');
    else if (b.dataset.act === 'start') startPlan(b.dataset.id);
    else if (b.dataset.act === 'skip') skipPlan(b.dataset.id, true);
  });
  $('#timeline').addEventListener('click', e => {
    if (justDragged) return;
    const pb = e.target.closest('[data-plan]'); if (pb) { openPlan(pb.dataset.plan); return; }
    const sb = e.target.closest('[data-ses]'); if (sb) { openSession(sb.dataset.ses); return; }
    const z = e.target.closest('.zone'); if (!z) return;
    const r = z.getBoundingClientRect();
    const m = clamp(snap(Number(z.dataset.slot) + (e.clientY - r.top) / PPM), tlFrom, END - 5);
    if (z.dataset.zone === 'p') openPlan(null, m); else openSession(null, m);
  });
  $$('.sheetback').forEach(b => b.addEventListener('click', e => { if (e.target === b && b.id !== 'confirmBack' && b.id !== 'overdueBack') b.classList.remove('show'); }));

  /* ---------- Androidアプリ（通知）との受け渡し ----------
     取り決めは docs/ANDROID_SHELL.md。v1.2 の形式はそのまま通る。
     画面 → アプリ：replaceSchedule（開始の通知）、setRunning（終了確認の通知）
     アプリ → 画面：dayFlowNotificationAction（画面が開いているとき）、takePendingActions（閉じていた間に押された分） */
  function syncNative() {
    const n = window.DayFlowNative;
    if (!n) return;
    if (n.replaceSchedule) {
      const cats = notifyCats(), now = Date.now(), items = [];
      for (const p of S.plans) {
        if (p.absorbed || p.status === 'skipped' || !cats.includes(p.category) || sessionsOfPlan(p.id).length) continue;
        const u = p.unitId && unitById(p.unitId);
        if (u && unitDone(u)) continue;
        // 通知時刻 when は「10分後」を押した場合だけ遅れる（予定の開始時刻 start は変えない）
        const when = p.notifyAt || DB.epochOf(p.date, p.start);
        if (when > now - 15 * 60000) items.push({ id: p.id, date: p.date, name: p.name, start: p.start, minutes: p.minutes, when });
      }
      try { n.replaceSchedule(JSON.stringify(items)); } catch (_) { }
    }
    if (n.setRunning) {
      const r = runningS();
      try { n.setRunning(r ? JSON.stringify({ sessionId: r.id, planId: r.planId, name: r.name, startedAt: r.startedAt, endAt: plannedEnd(r) }) : ''); } catch (_) { }
    }
  }
  /* Androidアプリの上下の帯（ステータスバー・ナビゲーションバーの裏）を、画面の色に合わせる。
     色は styles.css の --bar-top／--bar-bottom。古いアプリ（setBarColors なし）では何もしない。 */
  function syncBars() {
    const n = window.DayFlowNative;
    if (!n || !n.setBarColors) return;
    const cs = getComputedStyle(document.documentElement);
    try { n.setBarColors(cs.getPropertyValue('--bar-top').trim(), cs.getPropertyValue('--bar-bottom').trim()); } catch (_) { }
  }
  if (THEME) THEME.onChange(syncBars);
  /* 通知のボタン1回分を記録に反映する。at は押された時刻（ミリ秒）。省略時はいま。 */
  async function applyNativeAction(action, id, at) {
    at = Number(at) || Date.now();
    if (action === 'start') { const r = await DB.startPlan(id, 'watch', at); return r.ok ? '通知から計測を開始しました' : null; }
    if (action === 'skip') { await DB.skipPlan(id, true); return 'スキップを記録しました'; }
    if (action === 'snooze10') { await DB.snoozePlan(id, 10, at); return '10分後にもう一度通知します'; }
    if (action === 'finish') { const r = await DB.finishRunning('watch', at); return r.ok ? { finished: r.session } : null; }
    if (action === 'extend15') {
      const r = runningS(); if (!r) return null;
      const base = plannedMin(r) - (r.extendMin || 0);
      const extendMin = Math.max((r.extendMin || 0) + 15, Math.ceil((at + 15 * 60000 - r.startedAt) / 60000) - base);
      await DB.put('sessions', { ...r, extendMin });
      return '15分延長しました';
    }
    return null;
  }
  async function afterNative(results) {
    await commit();
    const last = results.filter(Boolean).pop();
    if (!last) return;
    if (typeof last === 'string') { toast(last); return; }
    const s = last.finished;
    toast(`完了を記録しました（${fmt(sessMin(s))}）`);
    const u = s.unitId && unitById(s.unitId);
    if (u && unitCheckable(u) && !anySheetOpen()) openUnit(u.id);
  }
  window.dayFlowNotificationAction = async function (action, id, at) {   // v1.2 のアプリ用（直接呼び出し）
    await reload();
    await afterNative([await applyNativeAction(action, id, at)]);
  };
  /* 画面が閉じていた間にアプリ側がためたボタン操作を、押された順に反映する。 */
  async function drainNative() {
    const n = window.DayFlowNative;
    if (!n || !n.takePendingActions) return;
    let list = [];
    try { list = JSON.parse(n.takePendingActions() || '[]'); } catch (_) { list = []; }
    if (!Array.isArray(list) || !list.length) return;
    await reload();
    list.sort((a, b) => (a.at || 0) - (b.at || 0));
    const results = [];
    for (const a of list) { results.push(await applyNativeAction(a.action, a.id, a.at)); await reload(); }
    await afterNative(results);
  }
  window.dayFlowDrain = drainNative;     // アプリ側がボタン操作をためた直後に呼ぶ

  /* ---------- その日の生き物の吹き出し ----------
     タップするたびに話題が変わる（今日の勉強 → いま／次のコマ → 積み残し → 今週 → 試験まで）。数秒で消える。 */
  function mateLines() {
    const k = dateKey, t = today();
    const studyPlan = plansOf(k).filter(p => p.category === 'study' && p.status !== 'skipped');
    const planMin = studyPlan.reduce((a, p) => a + p.minutes, 0);
    const actMin = sessionsOf(k).filter(s => s.category === 'study').reduce((a, s) => a + sessMin(s), 0);
    const lines = [];
    if (k === t) {
      if (planMin) lines.push(actMin >= planMin ? `今日の勉強は${fmt(actMin)}。予定の${fmt(planMin)}を達成したよ！` : `今日の勉強は${fmt(actMin)}／予定${fmt(planMin)}。あと${fmt(planMin - actMin)}だよ。`);
      else lines.push(actMin ? `今日は予定のない日だけど、${fmt(actMin)}勉強したよ。` : '今日は勉強の予定がない日だよ。');
      const r = runningS(), p = r ? null : nextPlan();
      if (r) lines.push(`いまは「${r.name}」の途中。${fmt(sessMin(r))}たったよ。`);
      else if (p && p.start + p.minutes > nowMin()) lines.push(p.start > nowMin() ? `次は${hm(p.start)}から「${p.name}」だよ。` : `「${p.name}」の時間だよ。始める？`);
    } else if (k < t) {
      lines.push(planMin || actMin ? `この日の勉強は${fmt(actMin)}／予定${fmt(planMin)}だったよ。` : 'この日は勉強の記録がないよ。');
    } else {
      lines.push(studyPlan.length ? `この日は勉強の予定が${studyPlan.length}つ、合わせて${fmt(planMin)}だよ。` : 'この日は勉強の予定がないよ。');
    }
    const g = progress();
    lines.push(g.outside ? `計画の期間からはみ出したコマが${g.outside}つあるよ。計画を見直そう。`
      : g.backlog > g.limit ? `積み残しが${g.backlog}コマあるよ。計画画面の「組み直す」で整えよう。`
        : g.backlog ? `積み残しは${g.backlog}コマ。${g.limit}コマを超える前に回収しよう。` : '積み残しはゼロ。予定どおり進んでるよ！');
    const ws = weekStart(t), we = addDays(ws, 6);
    const wk = S.sessions.filter(s => s.category === 'study' && s.date >= ws && s.date <= we).reduce((a, s) => a + sessMin(s), 0);
    lines.push(wk >= TARGET_WEEK_MIN ? `今週の勉強は${fmt(wk)}。目標の${fmt(TARGET_WEEK_MIN)}を達成したよ！`
      : `今週の勉強は${fmt(wk)}。目標の${fmt(TARGET_WEEK_MIN)}まで、あと${fmt(TARGET_WEEK_MIN - wk)}だよ。`);
    const metas = monthMetas(), meta = metas[metas.length - 1];
    if (meta && meta.exam) {
      const left = Math.max(0, Math.round((DB.keyToDate(meta.exam) - DB.keyToDate(t)) / 86400000));
      lines.push(`${meta.examLabel || '試験'}まで、あと${left}日だよ。`);
    }
    return lines;
  }
  $('#dayMate').addEventListener('click', () => {
    if (mateKey !== dateKey) { mateKey = dateKey; mateIdx = 0; }
    const lines = mateLines(), text = lines[mateIdx % lines.length], b = $('#mateBubble'), m = $('#dayMate');
    mateIdx++;
    b.textContent = text; b.hidden = false;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    m.classList.remove('hop'); void m.offsetWidth; m.classList.add('hop');
    clearTimeout(mateTimer);
    mateTimer = setTimeout(() => { b.hidden = true; }, clamp(3000 + text.length * 80, 4000, 8000));
  });
  $('#dayMate').addEventListener('animationend', e => { if (e.animationName === 'hop') $('#dayMate').classList.remove('hop'); });
  $('#mateBubble').addEventListener('click', () => { clearTimeout(mateTimer); $('#mateBubble').hidden = true; });

  /* ---------- タイムラインの背景を泳ぐ生き物（飾り）----------
     数秒〜十数秒おきに、見えている範囲のどこかを1匹ゆっくり横切る。同時に2匹まで。
     予定や実績のブロックより後ろを泳ぎ、タップの邪魔はしない。動きを減らす設定のときは出さない。 */
  const SWIMMERS = [
    { svg: SEA.school, size: 54, speed: 30 }, { svg: SEA.school, size: 46, speed: 34 },
    { svg: SEA.whale, size: 48, speed: 16 }, { svg: SEA.sunfish, size: 38, speed: 14 },
    { svg: SEA.boxfish, size: 30, speed: 20 }, { svg: SEA.ray, size: 44, speed: 18 },
    { svg: SEA.seahorse, size: 32, speed: 10 }, { svg: SEA.jelly, size: 34, speed: 8 }
  ];
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function swimTick() {
    clearTimeout(swimTimer);
    swimTimer = setTimeout(swimTick, 7000 + Math.random() * 9000);
    if (document.hidden || view !== 'day' || reduceMotion()) return;
    const el = $('#timeline'); if (!el || !el.animate) return;
    let layer = el.querySelector('.swimmers');
    if (!layer) { layer = document.createElement('div'); layer.className = 'swimmers'; layer.setAttribute('aria-hidden', 'true'); el.prepend(layer); }
    if (layer.children.length >= 2) return;
    const r = el.getBoundingClientRect();
    const top = Math.max(0, -r.top) + 10, bottom = Math.min(r.height - 40, window.innerHeight - r.top - 20);   // 見えている範囲（海底は避ける）
    const kind = SWIMMERS[Math.floor(Math.random() * SWIMMERS.length)];
    if (bottom - top < kind.size + 20) return;
    const y = Math.round(top + Math.random() * (bottom - top - kind.size));
    const ltr = Math.random() < 0.5, w = layer.getBoundingClientRect().width, size = kind.size;
    const node = document.createElement('div');
    node.className = 'swimmer';
    node.style.cssText = `top:${y}px;width:${size}px;height:${size}px`;
    // 絵はどれも左向き。右へ泳ぐときは裏返す
    node.innerHTML = `<div class="bob" style="animation-delay:-${(Math.random() * 4).toFixed(1)}s"><div class="face"${ltr ? ' style="transform:scaleX(-1)"' : ''}>${kind.svg}</div></div>`;
    layer.append(node);
    const from = ltr ? -size : w + size, to = ltr ? w + size : -size;
    const anim = node.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: (w + size * 2) / kind.speed * 1000, easing: 'linear' });
    anim.onfinish = anim.oncancel = () => node.remove();
  }

  /* ---------- 起動 ---------- */
  $$('[data-icon]').forEach(i => { i.innerHTML = SEA.icons[i.dataset.icon] || ''; });
  async function boot() {
    syncBars();
    // Androidのブラウザ（ホーム画面のショートカットを含む）で開いたときは、通知が来ないことを知らせる
    $('#browserNote').hidden = !!window.DayFlowNative || !/Android/i.test(navigator.userAgent);
    await DB.ensureSeed();
    await reload(); renderAll();
    await syncUnits();
    await drainNative();          // アプリ側にたまったボタン操作を先に反映してから、通知の予定を渡す（下の commit）
    await commit();
    scrollToNow();
    swimTimer = setTimeout(swimTick, 2500);
    if (new URLSearchParams(location.search).get('start') === 'pick') { history.replaceState(null, '', location.pathname); openPick(); }
    checkOverdue();
  }
  setInterval(() => {
    if (document.hidden) return;
    if (view === 'day' && !drag && !anySheetOpen()) { renderNow(); renderTimeline(); }
    checkOverdue();
  }, 30000);
  document.addEventListener('visibilitychange', async () => { if (!document.hidden) { await reload(); await drainNative(); await commit(); checkOverdue(); } });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.register('./sw.js').then(reg => reg.update()).catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'df-changed') commit(); });
  }
  boot();
})();
