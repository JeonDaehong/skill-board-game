"""Erase the Gemini sparkle watermark from the generated asset sheets.

The mark is a fixed 4-pointed star (~46px) alpha-composited near the bottom-right
corner, blended toward white at a peak alpha of ~0.31.

Two approaches were tried and rejected. Inverting the blend analytically leaves a
ghost, because the alpha can only be measured where the star lands on flat colour
and sub-pixel error is unforgiving. Inpainting the whole footprint erases it
cleanly but smears a blur wherever the footprint crosses an edge.

What works is exploiting where the star actually sits: most of its footprint lies
on the flat magenta backdrop, which gets keyed out later anyway, so only the part
overlapping real artwork needs repair — a much smaller region, tight enough that
diffusion fill stays invisible.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

RAW = r"D:/my-side-project/game/skill-board-game/apps/client/public/assets/raw"
OUT = r"D:/my-side-project/game/skill-board-game/apps/client/public/assets/clean"

STAR = {
    1: (903, 901), 2: (938, 484), 3: (939, 477), 4: (936, 466),
    5: (902, 901), 6: (940, 419), 7: (904, 901), 8: (903, 901),
    9: (936, 469), 10: (938, 481), 11: (903, 901), 12: (935, 415),
}
GROW = 3
ITERS = 500


def star_alpha():
    im = np.array(Image.open(f"{RAW}/8.png").convert("RGB")).astype(float)
    a = np.clip((im[867:935, 869:937, 1] - 30.0) / 225.0, 0, 1)
    return ndimage.gaussian_filter(a, 0.6)


def is_backdrop(im):
    """The flat magenta backdrop (keyed out downstream), tolerant of compression."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    return (r > 180) & (b > 180) & (g < 140)


def inpaint(im, mask, backdrop):
    """Diffusion fill. Backdrop pixels are held out of the relaxation entirely —
    otherwise magenta bleeds in and leaves a purple bruise on the artwork."""
    out = im.copy()
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return out
    y0, y1 = max(0, ys.min() - 4), min(im.shape[0], ys.max() + 5)
    x0, x1 = max(0, xs.min() - 4), min(im.shape[1], xs.max() + 5)
    sub, sm = out[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    bd = backdrop[y0:y1, x0:x1]

    ring = ndimage.binary_dilation(sm, iterations=3) & ~sm & ~bd
    if ring.sum() == 0:
        return out
    seed = np.array([sub[:, :, c][ring].mean() for c in range(3)])
    keep = sub[bd].copy()                      # park the backdrop
    for c in range(3):
        sub[:, :, c][sm] = seed[c]
        sub[:, :, c][bd] = seed[c]             # neutral, so it can't tint the fill

    k = np.array([[0.0, 0.25, 0.0], [0.25, 0.0, 0.25], [0.0, 0.25, 0.0]])
    for _ in range(ITERS):
        for c in range(3):
            ch = sub[:, :, c]
            ch[sm] = ndimage.convolve(ch, k, mode="nearest")[sm]

    sub[bd] = keep                             # put the backdrop back untouched
    out[y0:y1, x0:x1] = sub
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    a = star_alpha()
    th, tw = a.shape
    for n in sorted(STAR):
        im = np.array(Image.open(f"{RAW}/{n}.png").convert("RGB")).astype(float)
        cx, cy = STAR[n]

        foot = np.zeros(im.shape[:2], dtype=bool)
        foot[cy - th // 2:cy - th // 2 + th, cx - tw // 2:cx - tw // 2 + tw] = a > 0.03
        foot = ndimage.binary_dilation(foot, iterations=GROW)

        # Only repair where the star actually covers artwork.
        bd = is_backdrop(im)
        mask = foot & ~bd
        res = inpaint(im, mask, bd)

        Image.fromarray(res.astype(np.uint8)).save(f"{OUT}/{n}.png")
        print(f"{n}: footprint {int(foot.sum())} px, repaired {int(mask.sum())} px "
              f"({100*mask.sum()/max(1,foot.sum()):.0f}% on art)")


if __name__ == "__main__":
    main()
