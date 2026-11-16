#!/usr/bin/env python3
"""アイコンを描く。方眼の上に、予定（破線の枠）と実績（塗り）を少しずらして並べ、朱の現在線を引く。"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
PAPER, GRID, INK, BLUE, SHU = "#f6f7f3", "#d3dbe4", "#1c2836", "#2c5aa0", "#cf3f27"


def dashed_rect(d, box, color, width, dash):
    x0, y0, x1, y1 = box

    def line(a, b, horizontal, fixed):
        pos = a
        while pos < b:
            end = min(pos + dash, b)
            if horizontal:
                d.line([(pos, fixed), (end, fixed)], fill=color, width=width)
            else:
                d.line([(fixed, pos), (fixed, end)], fill=color, width=width)
            pos += dash * 2

    line(x0, x1, True, y0); line(x0, x1, True, y1); line(y0, y1, False, x0); line(y0, y1, False, x1)


def draw(size, inset):
    """inset: 絵柄を収める余白の割合（maskable は安全域のため大きめ）。"""
    s = 4
    S = size * s
    im = Image.new("RGB", (S, S), PAPER)
    d = ImageDraw.Draw(im)
    step = S // 8
    for i in range(1, 8):
        d.line([(i * step, 0), (i * step, S)], fill=GRID, width=max(1, S // 256))
        d.line([(0, i * step), (S, i * step)], fill=GRID, width=max(1, S // 256))
    a, b = S * inset, S * (1 - inset)
    w = b - a
    col = w * 0.36
    # 予定（左・破線）
    dashed_rect(d, (a + w * 0.06, a + w * 0.10, a + w * 0.06 + col, a + w * 0.66), BLUE, max(2, S // 56), S // 22)
    # 実績（右・塗り）：予定より少し遅れて始まり、少し長い
    d.rounded_rectangle((b - w * 0.06 - col, a + w * 0.26, b - w * 0.06, a + w * 0.90), radius=S // 40, fill=BLUE)
    # 現在線（朱）
    y = a + w * 0.52
    d.line([(a - w * 0.02, y), (b + w * 0.02, y)], fill=SHU, width=max(3, S // 44))
    r = S // 36
    d.ellipse((a - w * 0.02 - r, y - r, a - w * 0.02 + r, y + r), fill=SHU)
    return im.resize((size, size), Image.LANCZOS)


def badge(size):
    """通知バー用の単色シルエット（透過）。"""
    s = 4
    S = size * s
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((S * 0.16, S * 0.14, S * 0.44, S * 0.68), radius=S // 24, outline="white", width=S // 16)
    d.rounded_rectangle((S * 0.56, S * 0.30, S * 0.84, S * 0.88), radius=S // 24, fill="white")
    return im.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192, 0.16).save(OUT / "icon-192.png")
draw(512, 0.16).save(OUT / "icon-512.png")
draw(512, 0.24).save(OUT / "icon-maskable-512.png")
badge(96).save(OUT / "badge-96.png")
print("icons written")
