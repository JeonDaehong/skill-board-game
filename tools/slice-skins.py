"""Cut the skin sheets in `assets/skin/` into the files the renderer loads.

`slice-assets.py` is hardcoded to the first art batch and its sheet numbers; this
is the same machinery pointed at the skin drop, with one important difference:
the generator did not use the 3x4 grid the prompts asked for. Each piece sheet
came back as 2 rows x 6 columns, and each one grouped the light and dark sides
differently — so the reading order is declared per sheet rather than assumed.

Run from the repo root:  python tools/slice-skins.py
Add --contact to also write a labelled contact sheet per skin, so the mapping can
be eyeballed rather than trusted.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join("apps", "client", "public", "assets")
SRC = os.path.join(ROOT, "skin")

# Reading order, left to right then top to bottom, per sheet. The three sheets
# genuinely differ: S1 put light K/Q/R then dark K/Q/R on its first row, while S3
# put the whole light side on row one. Guessing one order for all of them would
# have silently swapped half of each set.
# `rose`: sheets whose halo interiors came back painted salmon (see key_out).
ROSE_SHEETS = {"S3"}

PIECE_SHEETS = {
    # S1 — demon. Row 1: light K Q R, dark K Q R. Row 2: light B N P, dark B N P.
    "S1": ("demon", 2, 6, [
        "wk", "wq", "wr", "bk", "bq", "br",
        "wb", "wn", "wp", "bb", "bn", "bp",
    ]),
    # S2 — ossuary. The sheet came back malformed: the light bishop is drawn
    # twice (cells 4 and 7) and the dark king is missing entirely. `None` drops
    # the duplicate, and leaving `bk` unwritten is deliberate — the renderer
    # falls back to the default black king for any file a skin does not provide,
    # so the set is playable while this one sheet is re-rolled.
    "S2": ("ossuary", 2, 6, [
        "wk", "wq", "wr", "wb", "bq", "br",
        None, "wn", "wp", "bb", "bn", "bp",
    ]),
    # S3 — angel. Row 1 is the whole marble side, row 2 the whole bronze side.
    "S3": ("angel", 2, 6, [
        "wk", "wq", "wr", "wb", "wn", "wp",
        "bk", "bq", "br", "bb", "bn", "bp",
    ]),
}

# Theme sheets are two full-bleed material tiles side by side, no key colour.
THEME_SHEETS = {
    "S4": "arcane",
    "S5": "marble",
    "S6": "sandstone",
}


def load(name):
    return np.array(Image.open(os.path.join(SRC, f"{name}.png")).convert("RGB")).astype(float)


def backdrop_mask(im):
    """True where the flat magenta key colour is."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    return (r > 170) & (b > 170) & (g < np.minimum(r, b) * 0.62)


def key_out(im, rose=False):
    """RGBA with the magenta keyed out and the magenta fringe despilled.

    `rose` also removes the desaturated salmon the angel sheet's dark row has
    filling the inside of every halo. That is not key spill — the generator
    painted it — but on the board it reads as a bright pink disc behind each
    head rather than as a halo, and the colour separates cleanly from everything
    that must survive: the fill sits at r-g ~70 while the cream marble bodies are
    at ~29 and the bronze ones at ~8. Gold leaf survives on |g-b|, which is ~90
    for gold and ~20 for the fill.
    """
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    spill = (r + b) / 2.0 - g
    key = np.clip((spill - 40.0) / 70.0, 0, 1)
    soft = ~backdrop_mask(im) & (key > 0.6)
    key[soft] = np.clip(key[soft], 0, 0.6)

    if rose:
        pink = (
            np.clip((r - g - 48.0) / 10.0, 0, 1)   # ramps in over r-g 48..58
            * ((r - b) > 40)
            * (np.abs(g - b) < 34)
        )
        key = np.maximum(key, pink)

    alpha = 1.0 - key

    out = im.copy()
    over = np.maximum((r + b) / 2.0 - g, 0) * key
    out[:, :, 0] = np.clip(r - over, 0, 255)
    out[:, :, 2] = np.clip(b - over, 0, 255)
    return np.dstack([out, alpha * 255.0])


def trim(rgba, pad=2):
    a = rgba[:, :, 3]
    ys, xs = np.nonzero(a > 12)
    if len(ys) == 0:
        return rgba
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
    return rgba[y0:y1, x0:x1]


def save(rgba, group, name):
    d = os.path.join(ROOT, group)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(os.path.join(d, f"{name}.png"))


def cut_pieces(sheet, folder, rows, cols, names, contact=False):
    im = load(sheet)
    rgba = key_out(im, rose=sheet in ROSE_SHEETS)
    h, w = im.shape[:2]
    ch, cw = h / rows, w / cols
    cells = []
    for i, name in enumerate(names):
        if name is None:
            continue
        r, c = divmod(i, cols)
        y0, y1 = int(r * ch), int((r + 1) * ch)
        x0, x1 = int(c * cw), int((c + 1) * cw)
        cut = trim(rgba[y0:y1, x0:x1])
        save(cut, os.path.join("pieces", folder), name)
        cells.append((name, cut))
        print(f"  pieces/{folder}/{name}.png  ({cut.shape[1]}x{cut.shape[0]})")
    if contact:
        write_contact(folder, cells)


def write_contact(folder, cells):
    """A labelled strip of what each cut became, for checking the mapping."""
    tile = 150
    cols = 6
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * tile, rows * (tile + 18)), (24, 16, 10, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (name, rgba) in enumerate(cells):
        r, c = divmod(i, cols)
        img = Image.fromarray(rgba.astype(np.uint8), "RGBA")
        img.thumbnail((tile - 10, tile - 10))
        ox = c * tile + (tile - img.width) // 2
        oy = r * (tile + 18) + (tile - img.height)
        sheet.alpha_composite(img, (ox, oy))
        draw.text((c * tile + 6, r * (tile + 18) + tile + 2), name, fill=(242, 217, 141, 255))
    out = os.path.join("tools", f"contact-{folder}.png")
    sheet.convert("RGB").save(out)
    print(f"  -> {out}")


def cut_theme(sheet, folder):
    """Two full-bleed tiles, side by side. No key colour to remove."""
    im = Image.open(os.path.join(SRC, f"{sheet}.png")).convert("RGB")
    w, h = im.size
    half = w // 2
    # Square the tiles off the shorter axis so the pattern is not stretched when
    # the renderer scales it to a square board cell.
    side = min(half, h)
    for name, x0 in (("light", 0), ("dark", half)):
        cx = x0 + (half - side) // 2
        cy = (h - side) // 2
        tile = im.crop((cx, cy, cx + side, cy + side))
        d = os.path.join(ROOT, "textures", folder)
        os.makedirs(d, exist_ok=True)
        tile.save(os.path.join(d, f"{name}.png"))
        print(f"  textures/{folder}/{name}.png  ({side}x{side})")


def main():
    contact = "--contact" in sys.argv
    for sheet, (folder, rows, cols, names) in PIECE_SHEETS.items():
        print(f"{sheet} -> pieces/{folder}")
        cut_pieces(sheet, folder, rows, cols, names, contact)
    for sheet, folder in THEME_SHEETS.items():
        print(f"{sheet} -> textures/{folder}")
        cut_theme(sheet, folder)


if __name__ == "__main__":
    main()
