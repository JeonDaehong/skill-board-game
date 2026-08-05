"""Cut the second asset batch (63 skill arts + UI) into individual PNGs.

Input : apps/client/public/assets/new/{S1..S7,U1..U3}.png
Output: apps/client/public/assets/{skills,icons,tokens,modes}/<name>.png

Same magenta-key pipeline as slice-assets.py. The difference is the grids: the
sheets were asked for as 2x5 and several came back 3x4 with a couple of scenes
painted twice, so every sheet carries its own measured grid and a name list with
`None` where the redundant copy landed.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "apps", "client", "public", "assets")
SRC = os.path.join(ROOT, "new")

# ── what each sheet holds, in reading order ────────────────────────────────
# None = a scene the sheet painted twice; the duplicate is dropped.
S1 = ["scout", "spy", "divination", "meditate",
      "offering", None, "disguise", "readiness",
      "bait", None, "small-sandbag", "vigilance"]
S2 = ["dash", "shove", "pull", "leap",
      "swamp", "small-shield", "clairvoyance", None,
      None, "herald", "javelin", "citadel"]
S3 = ["large-sandbag", "beacon", "insight", "ward", "cleanse",
      "unbind", "recall", "coerce", "transpose", "guard-drill"]
# S4 was redrawn (RE_S4) without the painted arch the first pass put inside every
# cell. It came back 3x4 like most of the others, with two scenes painted twice.
S4 = ["disarm", "mine", "hallucination", "espionage",
      None, "evade", "sever", "double",
      None, "blood-price", "promotion", "double-image"]
S5 = ["kings-strike", "rewind", "thrift", "riposte",
      "last-stand", "shatter", "exchange", None,
      "awaken", None, "brainwash", "bond-chain"]
S6 = ["fate-chain", "agile-knight", "muddy-water", "bodyguard",
      None, "pandemonium", "assassinate", "regicide",
      None, "sanctuary", "plague", "purifying-light"]
S7 = ["typhoon", "earthquake", "gambling-den"]

# U1: the five card kinds, the four turn phases, then odds and ends.
U1 = ["kind-normal", "kind-quick", "kind-enchant", "kind-lasting",
      "kind-counter", "phase-draw", "phase-summon", "phase-skill",
      "phase-move", "cost-gem", "counter-horn", "dice",
      "card-burn", "sandbag", "trap", "watch-eye"]
# U2 came back 4x4: the eight tokens, then the same eight again as variants.
U2 = ["sandbag", "leap", "disarm", "swamp",
      "mine", "bond-chain", "fate-chain", "crown",
      None, None, None, None,
      None, None, None, None]
U3 = ["classic", "skill", "master"]

# Skill art from the first batch, for cards that no longer exist.
DEAD_SKILL_ART = [
    "retreat", "cross-diagonal", "raid-march", "chaos", "foresight", "iron-guard",
    "sacrifice-pact", "phantom", "teleport", "cloak", "loyal-vassal", "undo",
    "one-more", "revive-gamble", "evolve-gamble", "peasant-revolt", "kings-return",
    "titan-fusion", "liberation",
]


def load(name):
    return np.array(Image.open(f"{SRC}/{name}.png").convert("RGB")).astype(float)


def backdrop_mask(im):
    """True where the flat magenta key colour is."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    return (r > 170) & (b > 170) & (g < np.minimum(r, b) * 0.62)


def key_out(im):
    """RGBA with the magenta keyed out and the magenta fringe despilled."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    spill = (r + b) / 2.0 - g
    key = np.clip((spill - 40.0) / 70.0, 0, 1)
    soft = ~backdrop_mask(im) & (key > 0.6)
    key[soft] = np.clip(key[soft], 0, 0.6)
    alpha = 1.0 - key

    out = im.copy()
    over = np.maximum((r + b) / 2.0 - g, 0) * key
    out[:, :, 0] = np.clip(r - over, 0, 255)
    out[:, :, 2] = np.clip(b - over, 0, 255)
    return np.dstack([out, alpha * 255.0])


def trim(rgba, pad=1):
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


def cut_scenes(sheet, rows, cols, names, group, inset=8, band=None):
    """Full-bleed illustrations separated by magenta gutters.

    `band` keeps only the middle fraction of each cell's height. The card's art
    window is landscape; a portrait cell would otherwise be cropped to ribbons by
    the browser, and on S4 the middle band is also what drops the painted arch
    the sheet added along the top edge.
    """
    im = load(sheet)
    h, w, _ = im.shape
    ch, cw = h / rows, w / cols
    for i, name in enumerate(names):
        if name is None:
            continue
        r, c = divmod(i, cols)
        cell = im[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
        cell = cell[inset:-inset, inset:-inset]
        if band:
            keep = int(cell.shape[0] * band)
            top = (cell.shape[0] - keep) // 2
            cell = cell[top:top + keep]
        a = np.full(cell.shape[:2] + (1,), 255.0)
        save(np.dstack([cell, a]), group, name)
        print(f"  {group}/{name}  ({cell.shape[1]}x{cell.shape[0]})")


def cut_tiles(sheet, rows, cols, names, group, inset=10):
    """Subjects sitting on the magenta backdrop: key it out and trim to fit."""
    im = load(sheet)
    h, w, _ = im.shape
    ch, cw = h / rows, w / cols
    for i, name in enumerate(names):
        if name is None:
            continue
        r, c = divmod(i, cols)
        cell = im[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
        cell = cell[inset:-inset, inset:-inset]
        save(trim(key_out(cell)), group, name)
        print(f"  {group}/{name}")


def drop_dead_art():
    d = os.path.join(ROOT, "skills")
    for name in DEAD_SKILL_ART:
        p = os.path.join(d, f"{name}.png")
        if os.path.exists(p):
            os.remove(p)
            print(f"  removed skills/{name}.png (card no longer exists)")


def main():
    print("S1 -> skills"); cut_scenes("S1", 3, 4, S1, "skills")
    print("S2 -> skills"); cut_scenes("S2", 3, 4, S2, "skills")
    print("S3 -> skills");    cut_scenes("S3", 2, 5, S3, "skills")
    print("RE_S4 -> skills"); cut_scenes("RE_S4", 3, 4, S4, "skills", inset=12)
    print("S5 -> skills");    cut_scenes("S5", 3, 4, S5, "skills")
    print("S6 -> skills");    cut_scenes("S6", 3, 4, S6, "skills")
    print("S7 -> skills");    cut_scenes("S7", 1, 3, S7, "skills")
    # RE_U1 replaces U1, whose icons came sitting on opaque dark tiles.
    print("RE_U1 -> icons");  cut_tiles("RE_U1", 4, 4, U1, "icons", inset=14)
    print("U2 -> tokens"); cut_tiles("U2", 4, 4, U2, "tokens", inset=6)
    print("U3 -> modes");  cut_scenes("U3", 1, 3, U3, "modes", inset=20)
    print("cleanup");      drop_dead_art()


if __name__ == "__main__":
    main()
