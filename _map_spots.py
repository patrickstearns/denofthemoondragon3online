from PIL import Image, ImageDraw, ImageFont
import numpy as np
from scipy.ndimage import label, binary_opening, binary_closing, gaussian_filter

im = Image.open(r"DD3 Board.png").convert("RGB")
arr = np.array(im)
h, w, _ = arr.shape
r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)

# Path tiles: beige, tan, brown, blue water
beige = (r > 145) & (r < 230) & (g > 110) & (g < 195) & (b > 70) & (b < 160) & ((r - b) > 25)
brown = (r > 80) & (r < 160) & (g > 50) & (g < 120) & (b > 25) & (b < 85) & (r > g + 10) & ((r - b) > 30)
blue = (b > 90) & (b > r + 40) & (b > g + 10) & (r < 120)
# wooden doors
wood = (r > 95) & (r < 175) & (g > 55) & (g < 125) & (b > 30) & (b < 85) & (r > g + 12) & ((r - b) > 40)

mask = beige | brown | blue | wood
mask = binary_closing(mask, iterations=1)
mask = binary_opening(mask, iterations=1)

# Suppress huge decorations: gold pile, litter, goblet spill
# Keep only compact blobs
labeled, n = label(mask)
pts = []
for i in range(1, n + 1):
    ys, xs = np.where(labeled == i)
    area = len(xs)
    bw = xs.max() - xs.min()
    bh = ys.max() - ys.min()
    if area < 350 or area > 6500:
        continue
    if bw > 90 or bh > 90:
        continue
    cx, cy = xs.mean(), ys.mean()
    # skip far corners of gold
    if cx > 1180 and cy < 80:
        continue
    pts.append((cx / w * 100, cy / h * 100, int(cx), int(cy), area))

pts.sort(key=lambda p: (p[1], p[0]))
print("tiles", len(pts))
out = im.copy()
d = ImageDraw.Draw(out)
for i, (xp, yp, x, y, a) in enumerate(pts):
    d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(255, 0, 255), width=3)
    d.text((x + 10, y - 10), str(i), fill=(255, 255, 0))
out.save("_spots.png")
print("saved _spots.png")
for i, p in enumerate(pts):
    print(f"{i:3d}  {p[0]:5.1f} {p[1]:5.1f}")
