/* DayFlow — 海の生き物のイラスト（すべてこのアプリ用に描いたもの）。
   曜日ごとに1匹：日＝マンボウ、月＝ミズクラゲ、火＝ヒトデ、水＝クジラ、木＝タツノオトシゴ、金＝ハコフグ、土＝エイ。
   画面（js/app.js）から window.DFSea として使う。 */
(function (root) {
  'use strict';
  const EYE = '#1b3550', CHEEK = '#ff9aa2';
  const eye = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r || 2}" fill="${EYE}"/>`;
  const cheek = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.9" fill="${CHEEK}" opacity=".75"/>`;
  const wrap = (label, body) => `<svg viewBox="0 0 64 64" role="img" aria-label="${label}">${body}</svg>`;

  // 角を丸めた星形（ヒトデ）
  function starPoints(cx, cy, R, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
      pts.push((cx + d * Math.cos(a)).toFixed(1) + ',' + (cy + d * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  const sunfish = wrap('マンボウ', `
    <path d="M30 17C31 8 36 4 40 4c-1 5 0 10 2 14z" fill="#f2b65a"/>
    <path d="M30 47c1 9 6 13 10 13-1-5 0-10 2-14z" fill="#f2b65a"/>
    <path d="M44 18c6 2 9 5 7 9 4 2 4 8 0 10 2 4-1 7-7 9z" fill="#f2b65a"/>
    <ellipse cx="30" cy="32" rx="19" ry="17" fill="#ffd683"/>
    <ellipse cx="27" cy="39" rx="12" ry="7.5" fill="#ffecc2" opacity=".85"/>
    <path d="M37 29q5 4 0 9" stroke="#f2b65a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    ${eye(19, 29)}<ellipse cx="13.6" cy="34.5" rx="1.5" ry="1.9" fill="${EYE}"/>${cheek(22, 35)}`);

  const jelly = wrap('ミズクラゲ', `
    <g fill="none" stroke="#b9c2f6" stroke-width="2.6" stroke-linecap="round">
      <path d="M20 35q-3 6 0 11t0 10"/><path d="M28 36q3 6 0 11t0 10"/><path d="M36 36q-3 6 0 11t0 10"/><path d="M44 35q3 6 0 11t0 10"/>
    </g>
    <path d="M12 30C12 16 22 8 32 8s20 8 20 22c0 4-4 5-7 3-3 3-7 3-9.5.5-2.5 2.5-4.5 2.5-7 0C26 36 22 36 19 33c-3 2-7 1-7-3z" fill="#d3d9fc"/>
    <g fill="none" stroke="#a7b2f0" stroke-width="1.8"><circle cx="28.6" cy="13.8" r="3"/><circle cx="35.4" cy="13.8" r="3"/><circle cx="28.6" cy="19.8" r="3"/><circle cx="35.4" cy="19.8" r="3"/></g>
    ${eye(25, 27)}${eye(39, 27)}<path d="M30 28.5q2 2 4 0" stroke="${EYE}" stroke-width="1.5" fill="none" stroke-linecap="round"/>${cheek(20.5, 30)}${cheek(43.5, 30)}`);

  const starfish = wrap('ヒトデ', `
    <polygon points="${starPoints(32, 34, 24, 11.5)}" fill="#f4837a" stroke="#f4837a" stroke-width="7" stroke-linejoin="round"/>
    <g fill="#ffc2b8"><circle cx="32" cy="16" r="1.6"/><circle cx="48" cy="29" r="1.6"/><circle cx="42" cy="48" r="1.6"/><circle cx="22" cy="48" r="1.6"/><circle cx="16" cy="29" r="1.6"/></g>
    ${eye(27, 32)}${eye(37, 32)}<path d="M29.5 36q2.5 2.5 5 0" stroke="${EYE}" stroke-width="1.6" fill="none" stroke-linecap="round"/>${cheek(23, 36.5)}${cheek(41, 36.5)}`);

  const whale = wrap('クジラ', `
    <path d="M30 14q-1-6-6-7M30 14q1-6 6-7" stroke="#8fd6ec" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M8 36C8 24 18 16 32 16c12 0 18 6 20 14 2-4 5-7 9-7-1 4-1 6-3 8 2 1 3 3 3 6-4 0-7-2-9-4-2 11-10 17-22 17C17 50 8 46 8 36z" fill="#6aa9e0"/>
    <path d="M9 38c3 8 11 12 21 12 9 0 16-4 20-11-10 3-28 4-41-1z" fill="#e3f2fc"/>
    <path d="M33 37q4 7 10 3" stroke="#4d8fcb" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${eye(19, 32)}${cheek(24, 37)}`);

  const seahorse = wrap('タツノオトシゴ', `
    <path d="M34 38c2 8-2 16-8 16-5 0-7-5-4-8 2-2 5-1 5 2" fill="none" stroke="#4fbf9a" stroke-width="6" stroke-linecap="round"/>
    <path d="M38 26c6-1 8 4 5 8-1-3-3-4-5-3z" fill="#93dfc5"/>
    <path d="M27 20c-5 4-5 14 0 20 3 4 9 3 11-2 2-6-2-10-1-16z" fill="#4fbf9a"/>
    <path d="M27.5 27c-2.5 4-2 9 1 12" stroke="#c5f0e1" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M28 10l1.5-5 3 3.5 3-4 1.5 6z" fill="#4fbf9a" stroke="#4fbf9a" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="32" cy="17" r="9" fill="#4fbf9a"/>
    <path d="M25 16.5l-12 3c-1.6.4-1.6 3 0 3.3l12-1.3z" fill="#4fbf9a" stroke="#4fbf9a" stroke-width="1.5" stroke-linejoin="round"/>
    ${eye(30, 16)}${cheek(34.5, 20.5)}`);

  const boxfish = wrap('ハコフグ', `
    <path d="M50 30l10-6c1 4 1 12 0 16l-10-6z" fill="#f2b33d"/>
    <path d="M30 16q4-7 9 0zM30 48q4 7 9 0z" fill="#f2b33d"/>
    <rect x="10" y="16" width="42" height="32" rx="11" fill="#ffd34f"/>
    <g fill="#e39d2c" opacity=".85"><circle cx="31" cy="24" r="2"/><circle cx="42" cy="27" r="2"/><circle cx="34" cy="34" r="2"/><circle cx="44" cy="38" r="2"/><circle cx="28" cy="42" r="2"/></g>
    ${eye(18, 28, 2.1)}<ellipse cx="10.5" cy="35" rx="2.6" ry="2.2" fill="#ff8d7a"/>${cheek(21, 35.5)}`);

  const ray = wrap('エイ', `
    <path d="M32 46c0 6 4 12 10 14" stroke="#c9a472" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M32 10c8 4 22 12 28 20-8 6-18 14-28 18C22 44 12 36 4 30c6-8 20-16 28-20z" fill="#e2c391" stroke="#e2c391" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 15c6 4 12 9 14 15-4 6-9 10-14 12-5-2-10-6-14-12 2-6 8-11 14-15z" fill="#efd9b1"/>
    ${eye(26.5, 25)}${eye(37.5, 25)}<path d="M29.5 29.5q2.5 2.5 5 0" stroke="${EYE}" stroke-width="1.6" fill="none" stroke-linecap="round"/>${cheek(22.5, 30)}${cheek(41.5, 30)}`);

  // いまの時刻を泳ぐ小さな魚（タイムラインの現在線の先頭）
  const nowFish = `<svg viewBox="0 0 30 18" aria-hidden="true">
    <path d="M9 9L1 2.5c-.8 4.3-.8 8.7 0 13z" fill="var(--shu)"/>
    <ellipse cx="17" cy="9" rx="11" ry="7" fill="var(--shu)"/>
    <path d="M14 13.5q4 2 8-.5" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <circle cx="22" cy="7.5" r="1.6" fill="#fff"/><circle cx="22.4" cy="7.5" r=".9" fill="${EYE}"/></svg>`;

  // 海底（タイムラインのいちばん下＝深夜）の海藻とサンゴ
  const seaweed = `<svg viewBox="0 0 40 60" aria-hidden="true">
    <path d="M12 60c-6-12 6-16 0-28s6-14 2-24" fill="none" stroke="var(--kelp)" stroke-width="5" stroke-linecap="round"/>
    <path d="M26 60c5-10-5-13 0-22s-3-10 0-16" fill="none" stroke="var(--kelp-2)" stroke-width="4.5" stroke-linecap="round"/></svg>`;
  const coral = `<svg viewBox="0 0 44 40" aria-hidden="true">
    <g fill="none" stroke="var(--coral-deco)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 40V20M22 30l-10-8v-8M22 26l10-7v-9M12 22l-6-3M32 19l6-2M22 20V8"/></g></svg>`;

  // タブバーの線画アイコン
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const icons = {
    day: icon('<path d="M3 12c3-4.5 8-5.5 12-2.5l4.5-3.3v11.6L15 14.5c-4 3-9 2-12-2.5z"/><circle cx="8" cy="11.3" r=".7" fill="currentColor"/>'),
    plan: icon('<path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>'),
    week: icon('<path d="M3 7.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 12.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>'),
    settings: icon('<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/><path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5M5.3 5.3l3.2 3.2M15.5 15.5l3.2 3.2M18.7 5.3l-3.2 3.2M8.5 15.5l-3.2 3.2"/>')
  };

  const byWeekday = [sunfish, jelly, starfish, whale, seahorse, boxfish, ray];   // 日〜土
  const names = ['マンボウ', 'ミズクラゲ', 'ヒトデ', 'クジラ', 'タツノオトシゴ', 'ハコフグ', 'エイ'];

  root.DFSea = { byWeekday, names, sunfish, jelly, starfish, whale, seahorse, boxfish, ray, nowFish, seaweed, coral, icons };
})(typeof self !== 'undefined' ? self : this);
