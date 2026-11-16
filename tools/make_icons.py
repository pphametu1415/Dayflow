#!/usr/bin/env python3
"""アイコンを描く。水色の海に、このアプリ用に描いたクジラ（js/sea.js の水曜の生き物）を浮かべる。

出力：
  icons/icon-512.png, icons/icon-192.png, icons/icon-maskable-512.png   … 画面（PWA）用
  android/.../mipmap-xxxhdpi/ic_launcher.png                            … Androidアプリ用（旧形式）
  android/.../mipmap-xxxhdpi/ic_launcher_background.png, ic_launcher_foreground.png … Androidアプリ用（丸や角丸に切り抜かれる形式）

SVG を Chrome で画像にするので、Playwright が要る（pip install playwright && playwright install chromium）。
通知用の icons/badge-96.png はここでは作らない（白一色の別の絵）。
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
MIPMAP = ROOT / "android/app/src/main/res/mipmap-xxxhdpi"

EYE, CHEEK = "#1b3550", "#ff9aa2"

# js/sea.js のクジラと同じ絵（64×64 の座標）。
WHALE = f"""
<path d="M30 14q-1-6-6-7M30 14q1-6 6-7" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M8 36C8 24 18 16 32 16c12 0 18 6 20 14 2-4 5-7 9-7-1 4-1 6-3 8 2 1 3 3 3 6-4 0-7-2-9-4-2 11-10 17-22 17C17 50 8 46 8 36z" fill="#4f95d6"/>
<path d="M9 38c3 8 11 12 21 12 9 0 16-4 20-11-10 3-28 4-41-1z" fill="#eaf6fd"/>
<path d="M33 37q4 7 10 3" stroke="#3a7dbd" stroke-width="3" fill="none" stroke-linecap="round"/>
<circle cx="19" cy="32" r="2" fill="{EYE}"/>
<ellipse cx="24" cy="37" rx="3" ry="1.9" fill="{CHEEK}" opacity=".8"/>
"""


def sea(size, waves=True):
    """背景の海。size は一辺の長さ（px）。"""
    s = size / 512
    wave = ""
    if waves:
        wave = f"""
<g transform="scale({s})">
  <path d="M0 410q64-30 128 0t128 0 128 0 128 0V512H0z" fill="#ffffff" opacity=".45"/>
  <path d="M0 446q64-26 128 0t128 0 128 0 128 0V512H0z" fill="#ffffff" opacity=".6"/>
  <g fill="#ffffff" opacity=".55">
    <circle cx="96" cy="118" r="13"/><circle cx="128" cy="78" r="7"/><circle cx="418" cy="150" r="10"/><circle cx="440" cy="112" r="5"/>
  </g>
</g>"""
    return f"""
<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#c8f0f7"/><stop offset="1" stop-color="#6fcbe3"/></linearGradient></defs>
<rect width="{size}" height="{size}" fill="url(#sea)"/>{wave}"""


def whale(size, scale):
    """クジラを画像の中央に置く。絵の中心は (34.5, 28.5)。"""
    tx, ty = size / 2 - 34.5 * scale, size / 2 - 28.5 * scale
    return f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{WHALE}</g>'


def svg(size, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{body}</svg>'


JOBS = [
    # (出力先, 一辺, SVG の中身, 背景を透明にするか)
    (ICONS / "icon-512.png", 512, sea(512) + whale(512, 5.6), False),
    (ICONS / "icon-192.png", 192, sea(192) + whale(192, 2.1), False),
    (ICONS / "icon-maskable-512.png", 512, sea(512) + whale(512, 4.6), False),      # 切り抜かれても欠けない大きさ
    (MIPMAP / "ic_launcher.png", 192, sea(192) + whale(192, 2.1), False),
    (MIPMAP / "ic_launcher_background.png", 432, sea(432, waves=False), False),
    (MIPMAP / "ic_launcher_foreground.png", 432, whale(432, 3.7), True),             # 中央 264px の円に収める
]


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for out, size, body, transparent in JOBS:
            page = await browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            await page.set_content(f'<body style="margin:0;background:transparent">{svg(size, body)}</body>')
            out.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(out), omit_background=transparent, clip={"x": 0, "y": 0, "width": size, "height": size})
            await page.close()
            print("wrote", out.relative_to(ROOT))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
