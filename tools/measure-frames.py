"""Measure each card frame's painted interior and print the CSS custom properties.

The five frames are hand-painted, so their interiors do not line up with each
other — the parchment panel's centre wanders across the card and the cost socket
sits anywhere from 13.6% to 23.1% in. Anything positioned by a single set of
numbers drifts off the artwork, so every box is measured off its own PNG.

Landmarks, all as percentages of the frame:
  art window   the transparent hole punched in the upper half
  text panel   the parchment block, found by colour
  name banner  the band between them
  cost socket  a circle, fitted by maximising edge energy around its ring
Paste the output into the `.tcg-card.t-*` rules in style.css.
"""
import numpy as np
from PIL import Image
from scipy import ndimage
import os

FRAMES = os.path.join(os.path.dirname(__file__), "..", "apps", "client", "public", "assets", "frames")
TIERS = ["common", "uncommon", "rare", "epic", "legendary"]
GLOW = {
    "common": "rgba(190, 168, 118, 0.5)", "uncommon": "rgba(127, 174, 74, 0.5)",
    "rare": "rgba(90, 131, 196, 0.55)", "epic": "rgba(154, 99, 200, 0.55)",
    "legendary": "rgba(224, 150, 70, 0.65)",
}
# Rough centre of each socket, to keep the circle fit off the corner filigree.
PRIOR = {"common": (21.5, 13.0), "uncommon": (13.0, 11.0), "rare": (16.5, 16.0),
         "epic": (13.0, 15.0), "legendary": (12.5, 17.0)}
BLEED = 1.5  # the art box overshoots the window so no seam shows at its edge


def art_window(alpha):
    """The transparent hole inside the card (not the transparency around it)."""
    h, w = alpha.shape
    lab, n = ndimage.label(alpha < 40)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    best = None
    for i in range(1, n + 1):
        if i in edge:
            continue
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 0.02 * h * w:
            continue
        if best is None or len(ys) > best[0]:
            best = (len(ys), ys.min(), ys.max(), xs.min(), xs.max())
    return best[1:]


def text_panel(im, alpha):
    """The parchment block: light, warm and opaque, spanning most of the width."""
    h, w = alpha.shape
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    parch = (alpha > 200) & (r > 150) & (g > 125) & (b > 85) & ((r - b) > 25) & ((r - b) < 110)
    rows = parch.sum(axis=1)
    runs, start = [], None
    for y in range(h):
        if rows[y] > 0.30 * w and start is None:
            start = y
        elif rows[y] <= 0.30 * w and start is not None:
            runs.append((start, y - 1)); start = None
    if start is not None:
        runs.append((start, h - 1))
    y0, y1 = max((r for r in runs if r[1] - r[0] > 0.06 * h), key=lambda r: r[1] - r[0])
    band = parch[y0 + int(0.15 * (y1 - y0)):y1 - int(0.10 * (y1 - y0)), :]
    cols = np.nonzero(band.sum(axis=0) > 0.5 * band.shape[0])[0]
    return y0, y1, cols.min(), cols.max()


def cost_socket(gray, prior):
    """Fit the socket ring: the circle whose rim carries the most edge energy."""
    h, w = gray.shape
    mag = ndimage.gaussian_filter(np.hypot(ndimage.sobel(gray, 0), ndimage.sobel(gray, 1)), 1.0)
    angs = np.linspace(0, 2 * np.pi, 120, endpoint=False)
    ca, sa = np.cos(angs), np.sin(angs)
    px, py = prior
    best = None
    for rad in np.arange(0.062 * w, 0.084 * w, 0.4):
        for cy in np.arange((py - 4) / 100 * h, (py + 4) / 100 * h, 0.4):
            for cx in np.arange((px - 4) / 100 * w, (px + 4) / 100 * w, 0.4):
                xs = np.clip((cx + rad * ca).astype(int), 0, w - 1)
                ys = np.clip((cy + rad * sa).astype(int), 0, h - 1)
                score = mag[ys, xs].mean()
                if best is None or score > best[0]:
                    best = (score, cx, cy, rad)
    _, cx, cy, rad = best
    return cx, cy, rad


def main():
    for tier in TIERS:
        img = Image.open(os.path.join(FRAMES, f"{tier}.png")).convert("RGBA")
        im = np.array(img).astype(int)
        alpha = im[:, :, 3]
        gray = np.array(img.convert("L")).astype(float)
        h, w = alpha.shape
        pc_w, pc_h = lambda v: 100 * v / w, lambda v: 100 * v / h

        wy0, wy1, wx0, wx1 = art_window(alpha)
        py0, py1, px0, px1 = text_panel(im, alpha)
        gx, gy, grad = cost_socket(gray, PRIOR[tier])

        print(f".tcg-card.t-{tier} {{ --tg: {GLOW[tier]};")
        print(f"  --gx: {pc_w(gx):.1f}%; --gy: {pc_h(gy):.1f}%; --gd: {pc_w(2 * grad):.1f}%;")
        print(f"  --px0: {pc_w(px0):.1f}%; --px1: {pc_w(w - 1 - px1):.1f}%;"
              f" --py0: {pc_h(py0):.1f}%; --py1: {pc_h(h - 1 - py1):.1f}%;")
        print(f"  --by0: {pc_h(wy1):.1f}%; --bh: {pc_h(py0 - wy1):.1f}%;")
        print(f"  --ax0: {max(0, pc_w(wx0) - BLEED):.1f}%; --ax1: {max(0, pc_w(w - 1 - wx1) - BLEED):.1f}%;"
              f" --ay0: {max(0, pc_h(wy0) - BLEED):.1f}%; --ay1: {max(0, pc_h(h - 1 - wy1) - BLEED):.1f}%; }}")


if __name__ == "__main__":
    main()
