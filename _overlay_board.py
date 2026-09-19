"""Overlay current board.js spots and detect tile/door centers on DD3 Board.png."""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import re
from pathlib import Path
from scipy.ndimage import label, binary_opening, binary_closing, gaussian_filter

ROOT = Path(r"c:\Users\David\Desktop\Jovian Games\Games\Dragons Den III")
im = Image.open(ROOT / "public" / "assets" / "DD3-Board.png").convert("RGB")
arr = np.array(im)
h, w, _ = arr.shape
print("size", w, h)

src = (ROOT / "server" / "engine" / "board.js").read_text(encoding="utf-8")
spots = []
for m in re.finditer(
    r'S\("([^"]+)",\s*([0-9.]+),\s*([0-9.]+)(?:,\s*\{([^}]*)\})?\)',
    src,
):
    extra = m.group(4) or ""
    kind = "path"
    if "room" in extra:
        kind = "room"
    elif "dragon" in extra:
        kind = "dragon"
    elif "start" in extra:
        kind = "start"
    spots.append((m.group(1), float(m.group(2)), float(m.group(3)), kind))

links = []
for m in re.finditer(r'chain\(spaces,\s*\[([^\]]+)\]\)', src, re.S):
    ids = re.findall(r'"([^"]+)"', m.group(1))
    for a, b in zip(ids, ids[1:]):
        links.append((a, b))
for m in re.finditer(r'link\(spaces,\s*"([^"]+)",\s*"([^"]+)"\)', src):
    links.append((m.group(1), m.group(2)))

byid = {s[0]: s for s in spots}

out = im.copy()
d = ImageDraw.Draw(out)
for a, b in links:
    if a in byid and b in byid:
        x1, y1 = byid[a][1] / 100 * w, byid[a][2] / 100 * h
        x2, y2 = byid[b][1] / 100 * w, byid[b][2] / 100 * h
        d.line([x1, y1, x2, y2], fill=(0, 220, 255), width=2)
for name, xp, yp, kind in spots:
    x, y = xp / 100 * w, yp / 100 * h
    col = {"room": (255, 60, 60), "dragon": (255, 200, 0), "start": (80, 255, 80)}.get(kind, (255, 0, 255))
    d.ellipse([x - 10, y - 10, x + 10, y + 10], outline=col, width=3)
    d.text((x + 12, y - 10), name, fill=(255, 255, 0))
out.save(ROOT / "_overlay_current.png")
print("current spots", len(spots), "links", len(links))

r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
# Exclude decorations
gold = (r > 175) & (g > 90) & (b < 90) & (r > g)
green = (g > r + 20) & (g > 90) & (b < 140)
gray_box = (np.abs(r.astype(int) - g) < 18) & (np.abs(g.astype(int) - b) < 18) & (r > 70) & (r < 170)
dark = (r + g + b) < 90

beige = (r > 150) & (r < 235) & (g > 115) & (g < 200) & (b > 70) & (b < 165) & ((r - b) > 25) & ((r - g) > 8)
brown = (r > 85) & (r < 165) & (g > 50) & (g < 125) & (b > 25) & (b < 90) & (r > g + 8) & ((r - b) > 28)
blue = (b > 90) & (b > r + 30) & (b > g + 5) & (r < 140) & (g < 160)
wood = (r > 90) & (r < 185) & (g > 50) & (g < 130) & (b > 25) & (b < 95) & (r > g + 10) & ((r - b) > 35)

mask = (beige | brown | blue | wood) & ~gold & ~green & ~dark
# punch out known decorations by bounding boxes (percent)
def punch(mask, x0, y0, x1, y1):
    mask[int(y0 / 100 * h) : int(y1 / 100 * h), int(x0 / 100 * w) : int(x1 / 100 * w)] = False

punch(mask, 28, 68, 62, 90)  # cardboard boxes
punch(mask, 78, 72, 93, 88)  # litter pan
punch(mask, 48, 48, 68, 66)  # litter robot
punch(mask, 28, 8, 42, 22)   # igloo
punch(mask, 10, 8, 28, 32)   # goblet + spill (keep nearby path tiles — tighter)
punch(mask, 88, 0, 100, 10)  # gold pile except dragon approach

mask = binary_closing(mask, iterations=2)
mask = binary_opening(mask, iterations=1)

labeled, n = label(mask)
pts = []
for i in range(1, n + 1):
    ys, xs = np.where(labeled == i)
    area = len(xs)
    bw = int(xs.max() - xs.min())
    bh = int(ys.max() - ys.min())
    if area < 280 or area > 9000:
        continue
    if bw > 110 or bh > 110:
        continue
    cx, cy = float(xs.mean()), float(ys.mean())
    pts.append((cx / w * 100, cy / h * 100, int(cx), int(cy), area, bw, bh))

pts.sort(key=lambda p: (round(p[1], 1), round(p[0], 1)))
print("detected tiles", len(pts))
det = im.copy()
dd = ImageDraw.Draw(det)
for i, p in enumerate(pts):
    x, y = p[2], p[3]
    dd.ellipse([x - 8, y - 8, x + 8, y + 8], outline=(0, 255, 80), width=3)
    dd.text((x + 10, y - 8), str(i), fill=(255, 255, 0))
det.save(ROOT / "_overlay_detected.png")
for i, p in enumerate(pts):
    print(f"{i:3d}  {p[0]:5.1f} {p[1]:5.1f}  a={p[4]} {p[5]}x{p[6]}")
