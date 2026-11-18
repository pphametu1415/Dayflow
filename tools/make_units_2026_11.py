#!/usr/bin/env python3
"""学習カレンダー（2026年11月版）のコマ定義を data/units-2026-11.json に書き出す。

lecMin／exMin は、コマの中の講義と演習（A問題・復習）の目安の分数。途中までやったコマを組み直すときに、
残りの長さの計算に使う（11月分の data は v1 のままで、アプリ側の既定値 講義55分＋残りが同じ値になる）。

翌月分を作るときは、このファイルを複製して DAYS を書き換え、
data/index.json に1行足すだけでよい（アプリのコードは触らない）。
"""
import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "units-2026-11.json"


def G(uid, title, slot):
    return dict(id=uid, subj="行政法規", k="g", title=title, slot=slot, lec=True,
                exLabel="A問題", note="1問3分で分からなければ解説へ。上限75分", est=130, lecMin=55, exMin=75)


def K(uid, title):
    return dict(id=uid, subj="鑑定理論", k="k", title=title, slot="PM", lec=True,
                exLabel="復習・暗記", note="該当範囲の基準を穴埋め・音読で1周（45分）", est=100, lecMin=55, exMin=45)


def B(uid, title):
    return dict(id=uid, subj="行政法規", k="g", title=title, slot="AM", lec=False,
                exLabel="A問題", note="積み残し。所要時間を実測する", est=75, lecMin=0, exMin=75)


def Y(uid, slot, est):
    return dict(id=uid, subj="予備", k="y", title="積み残しの回収", slot=slot, lec=False,
                exLabel=None, note="未完了のA問題・復習を優先する", est=est)


DAYS = [
    ("2026-11-14", [B("b05b", "積み残し 第5回 後半"), B("b06a", "積み残し 第6回 前半"), K("k17a", "第17回 前半"), K("k17b", "第17回 後半")]),
    ("2026-11-15", [G("g07a", "第7回 前半", "AM"), K("k18a", "第18回 前半"), K("k18b", "第18回 後半")]),
    ("2026-11-16", [G("g07b", "第7回 後半", "WD")]),
    ("2026-11-17", [G("g08a", "第8回 前半", "WD")]),
    ("2026-11-18", [G("g08b", "第8回 後半", "WD")]),
    ("2026-11-19", [G("g09a", "第9回 前半", "WD")]),
    ("2026-11-20", [G("g09b", "第9回 後半", "WD")]),
    ("2026-11-21", [G("g10a", "第10回 前半", "AM"), K("k19a", "第19回 前半"), K("k19b", "第19回 後半")]),
    ("2026-11-22", [G("g10b", "第10回 後半", "AM"), K("k20a", "第20回 前半"), K("k20b", "第20回 後半")]),
    ("2026-11-23", [G("g11a", "第11回 前半", "AM"), K("k21a", "第21回 前半"), K("k21b", "第21回 後半")]),
    ("2026-11-24", [G("g11b", "第11回 後半", "WD")]),
    ("2026-11-25", [G("g12a", "第12回 前半", "WD")]),
    ("2026-11-26", [G("g12b", "第12回 後半", "WD")]),
    ("2026-11-27", [Y("y1127", "WD", 150)]),
    ("2026-11-28", [Y("y1128", "AM", 150), K("k22a", "第22回 前半"), K("k22b", "第22回 後半")]),
    ("2026-11-29", [Y("y1129a", "AM", 150), Y("y1129b", "PM", 210)]),
    ("2026-11-30", [Y("y1130", "WD", 150)]),
]

units = []
for date, items in DAYS:
    for it in items:
        units.append(dict(date=date, **it))

doc = {
    "month": "2026-11",
    "version": 1,
    "label": "11/14〜11/30",
    "exam": "2027-05-16",
    "examLabel": "短答式",
    # 時間帯ごとの開始時刻。同じ時間帯のコマは目安分ずつ順に並べて予定にする。
    "slots": {
        "AM": {"start": "09:30", "label": "9:30–12:00"},
        "PM": {"start": "15:00", "label": "15:00–18:30"},
        "WD": {"start": "20:00", "label": "20:00–22:30"},
    },
    "rules": [
        "平日は20:00開始。休日は9:30と15:00に開始する。",
        "行政法規のA問題は、1問3分で分からなければ解説へ進む。上限は1コマ75分。",
        "鑑定理論は、講義のあと該当範囲の基準を穴埋め・音読で1周（45分）。",
        "未完了が4コマを超えたら、新しい講義を止めて回収を優先する。",
        "予備は11/27、11/28午前、11/29、11/30の合計13.5時間。",
    ],
    "backlogLimit": 4,
    # 旧・学習カレンダーから引き継ぐチェック（2026-11-16時点の記録）。初回取り込み時だけ使う。
    "initial": {
        "b05b": {"exDone": True},
        "b06a": {"exDone": True},
        "k17a": {"lecDone": True, "exDone": True},
        "k17b": {"lecDone": True, "exDone": True},
    },
    "units": units,
}

OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({len(units)} units)")
