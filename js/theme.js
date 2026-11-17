/* DayFlow v2 — 海の明るさ（テーマ）。
   <head> で先に読み、最初の描画の前に <html data-sea="light|mid|deep"> を決める（色は styles.css）。
   選び方（mode）：
     auto     … 端末の明るい表示・暗い表示に合わせる（light か deep）
     light    … いつも明るい海
     deep     … いつも深い海
     progress … 進み具合で変わる。画面（js/app.js）が setLevel で light／mid／deep を渡す
   設定は端末ごとに localStorage に置く（バックアップには入れない）。 */
(function (root) {
  'use strict';
  var KEY = 'df-sea', LEVEL = 'df-sea-level';
  var MODES = ['auto', 'light', 'deep', 'progress'], LEVELS = ['light', 'mid', 'deep'];
  var BAR = { light: '#8fdcec', mid: '#2f86b5', deep: '#0e3152' };      // styles.css の --bar-top と同じ色
  var mq = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  var listeners = [];

  function get(k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { root.localStorage.setItem(k, v); } catch (_) { } }

  function mode() { var m = get(KEY); return MODES.indexOf(m) >= 0 ? m : 'auto'; }
  function level() { var l = get(LEVEL); return LEVELS.indexOf(l) >= 0 ? l : 'light'; }
  function resolved() {
    var m = mode();
    if (m === 'light' || m === 'deep') return m;
    if (m === 'progress') return level();
    return mq && mq.matches ? 'deep' : 'light';
  }
  function apply() {
    var r = resolved(), el = document.documentElement, changed = el.getAttribute('data-sea') !== r;
    el.setAttribute('data-sea', r);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR[r]);
    if (changed) listeners.forEach(function (f) { try { f(r); } catch (_) { } });
    return r;
  }
  function setMode(m) { if (MODES.indexOf(m) < 0) return; set(KEY, m); apply(); }
  function setLevel(l) { if (LEVELS.indexOf(l) < 0 || l === level()) return; set(LEVEL, l); apply(); }
  function onChange(f) { listeners.push(f); }

  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  apply();
  root.DFTheme = { MODES: MODES, mode: mode, level: level, resolved: resolved, setMode: setMode, setLevel: setLevel, onChange: onChange, apply: apply };
})(window);
