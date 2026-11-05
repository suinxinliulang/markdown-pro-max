#!/usr/bin/env python3
"""生成占位应用图标（1024×1024 PNG，无第三方依赖）。

用法：python3 scripts/gen-icon.py src-tauri/icons/source.png
之后再用 `pnpm tauri icon src-tauri/icons/source.png` 生成各平台尺寸。
"""

import struct
import sys
import zlib

SIZE = 1024
BG = (22, 24, 29)          # 背景：与深色主题一致
INK = (230, 237, 243)      # 前景：正文色
ACCENT = (88, 166, 255)    # 强调色


def rounded_alpha(x, y, margin, radius):
    """圆角矩形覆盖度（0..1），用于抗锯齿。"""
    left, top = margin, margin
    right, bottom = SIZE - margin, SIZE - margin
    if x < left or x > right or y < top or y > bottom:
        return 0.0
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    if dist <= radius - 1:
        return 1.0
    if dist >= radius:
        return 0.0
    return radius - dist


def bar(x, y, x0, y0, x1, y1, radius):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return 0.0
    cx = min(max(x, x0 + radius), x1 - radius)
    cy = min(max(y, y0 + radius), y1 - radius)
    dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    if dist <= radius - 1:
        return 1.0
    if dist >= radius:
        return 0.0
    return radius - dist


def blend(base, over, alpha):
    return tuple(round(b + (o - b) * alpha) for b, o in zip(base, over))


def build_pixels():
    rows = []
    # 三条“文本行” + 一条强调色光标，像一份正在编辑的文档
    lines = [
        (300, 340, 724, 400, INK),
        (300, 452, 560, 512, INK),
        (300, 564, 650, 624, INK),
    ]
    cursor = (694, 452, 724, 624, ACCENT)

    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            a = rounded_alpha(x, y, 40, 200)
            if a <= 0:
                row += bytes((0, 0, 0, 0))
                continue
            color = BG
            for (x0, y0, x1, y1, c) in lines:
                cov = bar(x, y, x0, y0, x1, y1, 22)
                if cov > 0:
                    color = blend(color, c, cov)
            cov = bar(x, y, cursor[0], cursor[1], cursor[2], cursor[3], 12)
            if cov > 0:
                color = blend(color, cursor[4], cov)
            row += bytes((*color, round(a * 255)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "src-tauri/icons/source.png"
    write_png(out, build_pixels())
    print(f"wrote {out} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
