"""Peak-detect every path tile on DD3 Board.png (no blob-merge)."""
from PIL import Image, ImageDraw
import numpy as np
from pathlib import Path
from scipy.ndimage import gaussian_filter, maximum_filter

ROOT = Path(r"c:\Users\David\Desktop\Jovian Games\Games\Dragons Den III")
im = Image.open(ROOT / "public" / "assets" / "DD3-Board.png").convert("RGB")
arr = np.array(im)
h, w, _ = arr.shape
r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)

beige = (r > 145) & (r < 240) & (g > 108) & (g < 205) & (b > 65) & (b < 170) & ((r - b) > 22) & ((r - g) > 4)
brown = (r > 78) & (r < 170) & (g > 45) & (g < 130) & (b > 20) & (b < 95) & (r > g + 6) & ((r - b) > 24)
blue = (b > 85) & (b > r + 28) & (b > g + 4) & (r < 145)
wood = (r > 88) & (r < 190) & (g > 48) & (g < 135) & (b > 22) & (b < 100) & (r > g + 8) & ((r - b) > 32)
gold = (r > 180) & (g > 100) & (b < 85)
green = (g > r + 18) & (g > 85) & (b < 150)
gray = (np.abs(r - g) < 16) & (np.abs(g - b) < 16) & (r > 60) & (r < 175)

mask = (beige | brown | blue | wood).astype(np.float32)
mask[gold] = 0
mask[green] = 0

def punch(x0, y0, x1, y1, val=0):
    mask[int(y0 / 100 * h) : int(y1 / 100 * h), int(x0 / 100 * w) : int(x1 / 100 * w)] = val

punch(29, 70, 60, 88)   # dead cat boxes
punch(79, 73, 92, 87)   # litter pan
punch(50, 50, 66, 64)   # litter robot
punch(30, 9, 41, 20)    # igloo
punch(14, 10, 26, 28)   # goblet bowl + spill (not the surrounding path)
punch(90, 0, 100, 8)    # gold coins

blur = gaussian_filter(mask, 7)
# local maxima
win = 22
mx = maximum_filter(blur, size=win)
peaks = (blur == mx) & (blur > 0.22)
ys, xs = np.where(peaks)
cand = list(zip(xs.tolist(), ys.tolist(), blur[ys, xs].tolist()))
cand.sort(key=lambda p: -p[2])

min_dist = 38  # px
kept = []
for x, y, s in cand:
    if any((x - kx) ** 2 + (y - ky) ** 2 < min_dist ** 2 for kx, ky, *_ in kept):
        continue
    # skip leftover gold
    if x > 1180 and y < 90:
        continue
    kept.append((x, y, s))

kept.sort(key=lambda p: (p[1], p[0]))
print("peaks", len(kept))
out = im.copy()
d = ImageDraw.Draw(out)
for i, (x, y, s) in enumerate(kept):
    d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(255, 0, 255), width=3)
    d.text((x + 10, y - 12), str(i), fill=(255, 255, 40))
out.save(ROOT / "_overlay_peaks.png")
for i, (x, y, s) in enumerate(kept):
    print(f"{i:3d}  {x / w * 100:5.1f} {y / h * 100:5.1f}")
