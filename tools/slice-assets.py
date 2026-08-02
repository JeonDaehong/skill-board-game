"""Cut the Gemini asset sheets into individual transparent PNGs.

Input : apps/client/public/assets/clean/{1..8}.png   (watermark already removed)
Output: apps/client/public/assets/<group>/<name>.png

Every sheet is painted on a flat magenta backdrop. We key that out, then despill —
partially transparent edge pixels keep a magenta fringe otherwise, which reads as
a purple halo once the icon sits on the game's warm brown UI.

Sheets 2/3/4 are full-bleed scenes separated by magenta gutters, so their cell
grid is measured from the gutters rather than assumed. Sheet 8 is an irregular
stack of UI plates, so its elements are found as connected components.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "apps", "client", "public", "assets")
SRC = os.path.join(ROOT, "clean")

# --- what each sheet holds, in reading order -------------------------------
ICONS = ["home", "profile", "shop", "single-play", "online", "deck", "options",
         "quit", "quick-match", "create-room", "join-room", "locked", "coin",
         "avatar", "unknown-card", "dice"]
PIECES = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"]
GAMES_SHOP = ["chess", "janggi", "omok", "dice-generic", "pack-starter",
              "queen-gold", "pack-premium", "theme-board", "boost", "trophy"]
TEXTURES = ["stone-light", "wood-dark", "wood-kaya", "parchment"]
FRAMES = ["common", "uncommon", "rare", "epic", "legendary"]
# All frames are resampled to this 5:7 canvas so their geometry is comparable.
FRAME_SIZE = (250, 350)
# Sheets 10 and 3 both came back as 3x4 rather than the 2x5 that was asked for,
# with two scenes duplicated on each. All ten uniques are present, so `None`
# simply drops the redundant copy.
SKILLS_A = ["retreat", "cross-diagonal", "raid-march", "chaos",
            "agile-knight", None, "foresight", "iron-guard",
            None, "sacrifice-pact", "phantom", "teleport"]
SKILLS_B = ["cloak", "loyal-vassal", "undo", "one-more",
            "revive-gamble", "evolve-gamble", "kings-return", "peasant-revolt",
            None, None, "titan-fusion", "liberation"]
PLATES = ["panel", "topbar", "banner", "button-gold", "button-wood", "button-wood-2",
          "avatar-frame"]
# Janggi discs, blue side then red. The two blank discs are spares — the sheet was
# a 4x4 and only 14 pieces exist.
JANGGI = ["bk", "ba", "be", "bh", "br", "bc", "bs", None,
          "wk", "wa", "we", "wh", "wr", "wc", "ws", None]
STONES = ["black", "white"]


def load(n):
    return np.array(Image.open(f"{SRC}/{n}.png").convert("RGB")).astype(float)


def backdrop_mask(im):
    """True where the flat magenta key colour is."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    return (r > 170) & (b > 170) & (g < np.minimum(r, b) * 0.62)


def key_out(im):
    """RGBA with the magenta keyed out and the magenta fringe despilled."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    spill = (r + b) / 2.0 - g                    # how magenta-tinted a pixel is
    key = np.clip((spill - 40.0) / 70.0, 0, 1)   # 0 = keep, 1 = fully background
    key[~backdrop_mask(im) & (key > 0.6)] = np.clip(key[~backdrop_mask(im) & (key > 0.6)], 0, 0.6)
    alpha = 1.0 - key

    out = im.copy()
    # despill: pull R and B down toward G wherever magenta bled into the edge
    over = np.maximum((r + b) / 2.0 - g, 0) * key
    out[:, :, 0] = np.clip(r - over, 0, 255)
    out[:, :, 2] = np.clip(b - over, 0, 255)

    rgba = np.dstack([out, alpha * 255.0])
    return rgba


def trim(rgba, pad=2):
    """Crop to the visible subject."""
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


def gutters(im, axis):
    """Indices where the sheet is pure backdrop all the way across — cell splits."""
    bg = backdrop_mask(im)
    line = bg.all(axis=axis)
    idx = np.nonzero(line)[0]
    if len(idx) == 0:
        return []
    runs, start = [], idx[0]
    for a, b in zip(idx, idx[1:]):
        if b != a + 1:
            runs.append((start, a))
            start = b
    runs.append((start, idx[-1]))
    return runs


def cut_subjects(n, rows, cols, names, group):
    """Sheets where each cell holds one subject floating on the backdrop.

    An even split clips them — the painted subjects routinely overflow their
    nominal cell. Instead every blob of non-backdrop pixels is assigned to the
    nearest cell centre (so a subject made of several pieces, like a pair of
    dice, stays together) and the union of its bounding boxes is the crop.
    """
    im = load(n)
    h, w, _ = im.shape
    solid = ndimage.binary_closing(~backdrop_mask(im), np.ones((5, 5)))
    lab, cnt = ndimage.label(solid)
    if cnt == 0:
        return
    areas = ndimage.sum(solid, lab, range(1, cnt + 1))
    floor = max(300, 0.0004 * h * w)

    boxes = {}
    for i in range(1, cnt + 1):
        if areas[i - 1] < floor:
            continue
        ys, xs = np.nonzero(lab == i)
        cy, cx = ys.mean(), xs.mean()
        r = min(rows - 1, max(0, int(cy / (h / rows))))
        c = min(cols - 1, max(0, int(cx / (w / cols))))
        k = r * cols + c
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        if k in boxes:
            p = boxes[k]
            boxes[k] = (min(p[0], y0), max(p[1], y1), min(p[2], x0), max(p[3], x1))
        else:
            boxes[k] = (y0, y1, x0, x1)

    ch, cw = h / rows, w / cols
    for i, name in enumerate(names):
        if name is None:
            continue
        r, c = divmod(i, cols)
        ch, cw = h / rows, w / cols
        box = boxes.get(i)
        if box and (box[3] - box[2] > 1.6 * cw or box[1] - box[0] > 1.6 * ch):
            box = None                          # a merged blob, not one subject
        if box:
            y0, y1, x0, x1 = box
        else:
            # Neighbouring subjects that share a painted backdrop merge into one
            # blob and get claimed by a single cell; fall back to whatever solid
            # pixels sit inside this cell's own bounds.
            ys0, ys1 = int(r * ch), int((r + 1) * ch)
            xs0, xs1 = int(c * cw), int((c + 1) * cw)
            local = solid[ys0:ys1, xs0:xs1]
            ys, xs = np.nonzero(local)
            if len(ys) == 0:
                print(f"  ! {group}/{name}: nothing found")
                continue
            y0, y1, x0, x1 = ys0 + ys.min(), ys0 + ys.max(), xs0 + xs.min(), xs0 + xs.max()
        p = 4
        cell = im[max(0, y0 - p):y1 + 1 + p, max(0, x0 - p):x1 + 1 + p]
        save(trim(key_out(cell)), group, name)
        print(f"  {group}/{name}  ({x1-x0+1}x{y1-y0+1})")


def cut_scenes(n, rows, cols, names, group):
    """Sheets of full-bleed illustrations separated by thin magenta gutters."""
    im = load(n)
    h, w, _ = im.shape
    ch, cw = h / rows, w / cols
    for i, name in enumerate(names):
        if name is None:
            continue
        r, c = divmod(i, cols)
        cell = im[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
        inner = cell[7:-7, 7:-7]                # drop the magenta gutter edge
        a = np.full(inner.shape[:2] + (1,), 255.0)
        save(np.dstack([inner, a]), group, name)
        print(f"  {group}/{name}  ({inner.shape[1]}x{inner.shape[0]})")


def largest_piece(rgba):
    """Drop everything but the biggest opaque blob.

    Cells carry slivers of their neighbours, and on the card frames those slivers
    shift the crop — which would misplace the art window they define.
    """
    solid = rgba[:, :, 3] > 128
    solid = ndimage.binary_closing(solid, np.ones((5, 5)))
    lab, cnt = ndimage.label(solid)
    if cnt <= 1:
        return rgba
    areas = ndimage.sum(solid, lab, range(1, cnt + 1))
    keep = int(np.argmax(areas)) + 1
    ys, xs = np.nonzero(lab == keep)
    out = rgba.copy()
    drop = solid & (lab != keep)
    out[:, :, 3][drop] = 0
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def cut_frames():
    """Sheet 4: keep the top row of five. The art window in each frame was painted
    magenta on purpose, so keying leaves it transparent — art goes behind it."""
    im = load(4)
    h, w, _ = im.shape
    row = im[0:int(h * 0.50), :]
    for i, name in enumerate(FRAMES):
        cell = row[:, int(i * w / 5):int((i + 1) * w / 5)]
        card = largest_piece(key_out(cell))
        # Normalise to one canvas so every frame is scaled identically by the
        # browser. They come out of the sheet at slightly different sizes and
        # aspect ratios, which stretched each one differently against the 5:7
        # card box and shifted where the text and cost gem landed.
        img = Image.fromarray(card.astype(np.uint8), "RGBA").resize(FRAME_SIZE, Image.LANCZOS)
        d = os.path.join(ROOT, "frames")
        os.makedirs(d, exist_ok=True)
        img.save(os.path.join(d, f"{name}.png"))
        print(f"  frames/{name}  ({FRAME_SIZE[0]}x{FRAME_SIZE[1]})")


def cut_plates():
    """Sheet 8: irregular stack — find each plate as a connected component."""
    im = load(8)
    solid = ~backdrop_mask(im)
    solid = ndimage.binary_closing(solid, np.ones((5, 5)))
    lab, cnt = ndimage.label(solid)
    boxes = []
    for i in range(1, cnt + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 4000:
            continue
        boxes.append((ys.min(), ys.max(), xs.min(), xs.max()))
    # group into rows first, then left-to-right within a row
    boxes.sort(key=lambda b: b[0])
    ordered, i = [], 0
    while i < len(boxes):
        row = [boxes[i]]
        while i + 1 < len(boxes) and boxes[i + 1][0] < boxes[i][1]:
            i += 1
            row.append(boxes[i])
        ordered.extend(sorted(row, key=lambda b: b[2]))
        i += 1
    boxes = ordered
    for (y0, y1, x0, x1), name in zip(boxes, PLATES):
        save(trim(key_out(im[y0:y1 + 1, x0:x1 + 1])), "ui", name)
        print(f"  ui/{name}  ({x1-x0+1}x{y1-y0+1})")
    if len(boxes) != len(PLATES):
        print(f"  ! found {len(boxes)} plates, expected {len(PLATES)}")


def main():
    print("sheet 1 -> icons");      cut_subjects(1, 4, 4, ICONS, "icons")
    print("sheet 5 -> pieces");     cut_subjects(5, 3, 4, PIECES, "pieces")
    print("sheet 6 -> games/shop"); cut_subjects(6, 2, 5, GAMES_SHOP, "objects")
    print("sheet 7 -> textures");   cut_scenes(7, 2, 2, TEXTURES, "textures")
    # sheet 10 replaces sheet 2: the first pass came back portrait, which the
    # card's landscape art window would have cropped to pieces.
    print("sheet 10 -> skill art"); cut_scenes(10, 3, 4, SKILLS_A, "skills")
    print("sheet 3 -> skill art");  cut_scenes(3, 3, 4, SKILLS_B, "skills")
    # sheet 9 replaces sheet 6's gomoku cell, which came with a wooden backdrop
    # baked in instead of a free-floating object.
    print("sheet 9 -> omok");     cut_subjects(9, 1, 1, ["omok"], "objects")
    print("sheet 11 -> janggi");  cut_subjects(11, 4, 4, JANGGI, "janggi")
    print("sheet 12 -> stones");  cut_subjects(12, 1, 2, STONES, "stones")
    print("sheet 4 -> frames");   cut_frames()
    print("sheet 8 -> ui");       cut_plates()


if __name__ == "__main__":
    main()
