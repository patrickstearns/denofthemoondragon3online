from PIL import Image, ImageDraw
import numpy as np
from scipy.ndimage import gaussian_filter

im = Image.open(r"DD3 Board.png").convert("RGB")
arr = np.array(im)
h, w, _ = arr.shape
r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)

beige = (r > 140) & (r < 235) & (g > 105) & (g < 200) & (b > 65) & (b < 165) & ((r - b) > 20)
brown = (r > 75) & (r < 165) & (g > 48) & (g < 125) & (b > 20) & (b < 90) & (r > g + 8) & ((r - b) > 25)
blue = (b > 85) & (b > r + 35) & (b > g + 8) & (r < 130)
wood = (r > 90) & (r < 180) & (g > 50) & (g < 130) & (b > 25) & (b < 90) & (r > g + 10) & ((r - b) > 35)
mask = (beige | brown | blue | wood).astype(np.float32)
# suppress gold pile / green spill
gold = (r > 180) & (g > 120) & (b < 80) & (r + g > 320)
green = (g > r + 25) & (g > 90)
mask[gold | green] = 0
# suppress litter robot / boxes roughly by dark-center? skip

blur = gaussian_filter(mask, 6)
step = 18
cand = []
for y in range(18, h - 18, step):
    for x in range(18, w - 18, step):
        if blur[y, x] < 0.28:
            continue
        # local max in 16px
        patch = blur[y - 12 : y + 13, x - 12 : x + 13]
        if blur[y, x] < patch.max() - 1e-6:
            continue
        cand.append((x / w * 100, y / h * 100, x, y, float(blur[y, x])))

# merge closer than 2.6%
cand.sort(key=lambda p: -p[4])
kept = []
for c in cand:
    if any((c[0] - k[0]) ** 2 + (c[1] - k[1]) ** 2 < 2.7 ** 2 for k in kept):
        continue
    # skip gold pile
    if c[0] > 90 and c[1] < 8:
        continue
    kept.append(c)

kept.sort(key=lambda p: (p[1], p[0]))
print("spots", len(kept))
out = im.copy()
d = ImageDraw.Draw(out)
for i, p in enumerate(kept):
    x, y = p[2], p[3]
    d.ellipse([x - 8, y - 8, x + 8, y + 8], outline=(255, 0, 255), width=3)
    d.text((x + 8, y - 8), str(i), fill=(255, 255, 0))
out.save("_spots2.png")
for i, p in enumerate(kept):
    print(f"{i:3d}  {p[0]:5.1f} {p[1]:5.1f}")
