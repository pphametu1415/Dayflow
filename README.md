# DayFlow v2

予定と実績を左右に並べて記録する、学習と生活のタイムライン（スマホ向けPWA）。
学習計画のコマがそのままその日の予定になり、計測した時間がコマの実績になる。

設計書：<https://claude.ai/artifact/H1h9yxUyuY3gFMKBqnq1Us>（非公開。持ち主のClaudeから読める）

## いまの状態（2026-11-17）

| 段階 | 内容 | 状態 |
| --- | --- | --- |
| 0 | 通知ボタンの判定テストページ（`test.html`） | 実装済み。実機（Galaxy Watch）での判定待ち |
| 1 | データ層と今日画面 | 実装済み |
| 2 | 学習コマの取り込みと計画画面 | 実装済み（2026年11月分） |
| 3 | 本番の通知（予定開始／終了確認） | 方式はB（Androidアプリが通知を出す）。画面側・アプリ側とも実装済み。アプリはビルド済み（リリース `android-latest`）。通知は実機未確認（`docs/ANDROID_SHELL.md`） |
| 4 | 週次画面 | 実装済み |
| 5 | 12月の計画データ | 未作成（11月下旬に作る） |
| 6 | 「この日は無理」（コマを後ろへ送って組み直す） | 実装済み（v2.3.0） |
| 7 | 海と水族館のデザイン | 実装済み（v2.3.0） |
| 8 | 「組み直す」（積み残しの精算と前倒し）、海の明るさの切り替え | 実装済み（v2.4.0） |

## ファイル

| ファイル | 役割 |
| --- | --- |
| `index.html` / `styles.css` | 画面の骨組みと見た目 |
| `js/db.js` | 保存（IndexedDB）とデータ操作。画面と service worker の両方が使う |
| `js/app.js` | 画面の表示と入力 |
| `js/theme.js` | 海の明るさ（明るい海・少し潜った海・深い海）を決める。`<head>` で先に読む |
| `js/sea.js` | 海の生き物のイラストとタブのアイコン（このアプリ用に描いたSVG）。曜日ごとに1匹出る |
| `sw.js` | オフライン対応、更新の反映、通知ボタンの受け取り |
| `test.html` | Watchで通知のボタンが押せるかを確かめるページ |
| `data/index.json` | 取り込む計画データの一覧（月・ファイル・版） |
| `data/units-YYYY-MM.json` | 月ごとの学習コマ |
| `tools/make_units_2026_11.py` | 11月分の計画データを作ったスクリプト。翌月分のひな形 |
| `tools/make_icons.py` | アイコン（画面用とAndroidアプリ用）を描くスクリプト |
| `.nojekyll` | GitHub Pages に「加工せず、そのまま公開する」と伝える空のファイル |
| `docs/ANDROID_SHELL.md` | Androidアプリ（殻）の仕様と受け入れ条件 |
| `android/` | Androidアプリ（殻）のソース。画面をネットから読み、通知を出す |
| `.github/workflows/android.yml` | APKを自動でビルドしてリリースに載せる |

ビルド工程はない。リポジトリの中身がそのまま公開物になる。
公開先は GitHub Pages（<https://pphametu1415.github.io/Dayflow/>）。リポジトリの Settings → Pages で、`main` ブランチの `/ (root)` を公開元にしている。pushすると1〜2分で反映される。

## データ構造

IndexedDB（データベース名 `dayflow`）。予定と実績は別レコードで、IDで関連付ける。

| ストア | 主な項目 |
| --- | --- |
| `cards` | `id` `name` `category` `minutes` `order` |
| `units` | `id` `month` `seq` `date` `slot` `subj` `k` `title` `lec` `exLabel` `note` `est` ／ 本人の記録：`lecDone` `exDone` `memo` `manualMin` |
| `plans` | `id` `date` `start`（0時からの分） `minutes` `cardId` `name` `category` `unitId` `fixed` `status`（`active`／`skipped`） `notifyAt` `userEdited` `absorbed` `early` |
| `sessions` | `id` `date` `planId` `unitId` `cardId` `name` `category` `startedAt` `endedAt`（計測中は `null`） `startSource` `endSource` `needsCheck` `extendMin` |
| `reviews` | `date` `study` `exercise` `sleep`（各1〜3） `sleepHours` `note` |
| `meta` | `key` `value`（`seeded`、`notifyCats`、`lastExport`、`units:YYYY-MM`、`lastCant`） |
| `log` | 通知テストの記録 |

決まり：

- 実績の分数は保存しない。`startedAt` と `endedAt` から毎回計算する。
- コマ1つにつき予定を1つ作る。予定のIDは `u-` ＋ コマのID。
- `planId` のない実績が「予定なしで開始」。
- 「10分後」は予定の `start` を変えず、`notifyAt`（通知時刻）だけ遅らせる。
- スキップは予定の `status` に残し、実績は作らない。
- 計測したまま予定終了＋30分を過ぎると、アプリを開いたときに終了時刻を確認する。「予定どおり終わったことにする」を選ぶと `endSource: auto`、`needsCheck: true` で閉じ、週次画面に「確認が必要」と出る。
- 開始の遅れ＝予定と同じ日に始めた最初の実績の `startedAt` − 予定の開始時刻。

「この日は無理」（予定を調整 → この日は無理）の決まり：

- 送るのは学習コマだけ（未完了・実績なし・固定していないもの）。運動などの予定は動かさない。
- 科目ごとに、講義の順番を保ったまま後ろの枠へ1つずつずらす。途中に予備の空きがあれば先にそこへ入れる。
- コマの定義（`units` の `date`）は変えず、予定（`plans` の `date`・`start`）だけを動かす。画面はコマの日付を予定の日付で見る。
- 予備の枠は、入れた分だけ短くする。残りが30分未満になった予備は `absorbed: true` にして、画面にも通知にも出さない。
- 予備が足りない分は、計画の最終日の翌日以降（20:00）に置き、確認画面で知らせる。
- 直前の1回は元に戻せる（`meta` の `lastCant` に動かす前の予定を残す）。送ったあとに実績がついたら戻せない。

「組み直す」（計画画面の積み残しの帯のボタン）の決まり：

- 「この日は無理」と同じ考え方で、計画全体をいまの進み具合に合わせる。学習コマだけ・科目ごと・講義の順番は変えない。
- 遅れているとき：過ぎた日の未完了コマを、これからの枠へ順番どおりに入れ直す。足りない分は予備の枠、それでも足りなければ計画の外。
- 進んでいるとき：先に終えたコマの枠が空くので、続きのコマを1つずつ前へ詰める（ボタンは「前に詰める」）。予備の枠は使わない。
- 先に終えたコマの予定は、計測していれば実際にやった日時へ合わせる。計測していなければ `early: true` にしてタイムラインから隠す。
- やりかけ（実績がついた）コマと、固定した予定は動かさない。直前の1回は元に戻せる（`lastCant` を共用）。

海の明るさ（設定画面）：

- 「端末に合わせる」「明るい海」「深い海」「進み具合で変わる」から選ぶ。端末ごとに `localStorage`（`df-sea`）に保存する。
- 「進み具合で変わる」：積み残しなし＝明るい海、積み残しあり＝少し潜った海、積み残しが上限（`backlogLimit`）を超えた・計画の期間からはみ出したコマがある＝深い海。
- 色は `styles.css` の `:root`（明るい海）、`:root[data-sea="mid"]`、`:root[data-sea="deep"]`。

## 翌月の計画を入れる手順

1. `tools/make_units_2026_11.py` を複製し、`DAYS`・`month`・`label`・`rules` を書き換えて実行する。
2. `data/index.json` の `months` に1行足す。
3. pushする。アプリは次に開いたときに新しい月を取り込む。

同じ月を直したときは `version` を上げる（ファイルと `index.json` の両方）。チェック・メモ・本人が動かした予定・実績のある予定は残る。

## 通知の方式

B方式（Androidアプリの殻が端末内アラームで通知を出す）に決定（2026-11-16）。
v1.2 のアプリの通知が Galaxy Watch にボタン付きで届き、押すと動くことを本人が実機で確認済みのため。

- 殻の仕様と受け渡しの取り決め：`docs/ANDROID_SHELL.md`
- 画面側の実装：`js/app.js` の「Androidアプリ（通知）との受け渡し」
- `test.html` と `sw.js` の通知ボタンの受け口は、A方式（PWAのWeb通知）を試すためのもの。B方式では使わないが、ブラウザだけで使う場合の足場として残してある。

## Androidアプリ

Android Studio は使わない。`android/` を変えてpushすると GitHub Actions がAPKを作り、
リリース `android-latest` に `dayflow.apk` として載せる。スマホでそのページを開いてダウンロードし、インストールする。

- 画面（Web）だけの変更：pushすれば終わり。アプリは画面をネットから読むので、入れ直さない。
- 通知の仕組み（`android/`）の変更：新しい `dayflow.apk` を入れ直す。同じ署名鍵なら上書きでき、記録は残る。
- 画面の置き場所：`android/app/build.gradle` の `appUrl`（いまは `https://pphametu1415.github.io/Dayflow/`。2026-11-17 に Netlify から変更）。ここを変えると記録の保存場所も変わるので、変える前に書き出しておく。
- v1.2 のアプリ（Android Studioで作ったもの）とは別のアプリとして入る（アプリIDは `app.dayflow.shell`）。

### 署名鍵（最初に1回だけ）

鍵がシークレットに入っていないと、ビルドごとに別の鍵で署名され、入れ直すたびに記録が消える。**初めてスマホに入れる前に**設定する。

```
keytool -genkeypair -keystore dayflow.jks -alias dayflow -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass '<パスワード>' -keypass '<パスワード>' -dname 'CN=DayFlow'
base64 -w0 dayflow.jks | gh secret set DAYFLOW_KEYSTORE_B64 -R pphametu1415/Dayflow
gh secret set DAYFLOW_KEYSTORE_PASSWORD -R pphametu1415/Dayflow -b '<パスワード>'
```

`dayflow.jks` とパスワードは、リポジトリに入れずに保管する（なくすと上書きインストールできなくなる）。

## 手元で動かす

```
python3 -m http.server 8000
```

`http://localhost:8000/` を開く。
