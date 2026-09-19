"""Build board.js from curated tile centers (peak-detected + hand-fixed)."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(r"c:\Users\David\Desktop\Jovian Games\Games\Dragons Den III")

# id, x, y, kind, red, yellow
# kind: start | path | room | dragon
S = []

def add(i, x, y, kind="path", red=0, yellow=0):
    S.append((i, x, y, kind, red, yellow))

# --- Outer: start up left wall, across top, into dragon ---
add("start", 7.2, 92.7, "start")
add("a1", 12.9, 86.0)
add("r1", 19.1, 80.1, "room")  # first door
add("a2", 9.0, 76.6)
add("a3", 5.7, 69.2)
add("r2", 5.2, 61.5, "room", 3, 1)  # left 3r1y (center of door, not split peaks)
add("a4", 5.9, 54.5)
add("a5", 6.5, 49.0)
add("r3", 7.7, 43.5, "room")
add("a6", 8.4, 35.3)
add("a7", 8.0, 30.0)
add("r4", 7.6, 26.5, "room", 3, 2)
add("a8", 9.3, 19.8)
add("r5", 8.6, 13.0, "room")  # left of fountain
add("a8c", 9.8, 8.2)
add("a9", 14.9, 2.9)
add("r6", 25.3, 5.4, "room")
add("a10", 30.3, 7.0)
add("a11", 35.3, 7.2)
add("a12", 41.3, 7.0)
add("r7", 50.7, 3.9, "room", 3, 3)
add("a13", 59.0, 7.3)
add("a14", 64.3, 8.4)  # black cat
add("r8", 71.2, 4.3, "room")
add("a15", 76.3, 4.0)
add("a16", 81.1, 4.7)
add("a17", 85.5, 4.9)
add("a18", 90.0, 5.5)
add("dragon", 94.2, 5.2, "dragon")

# --- Right descent from the top-right fork ---
add("b1", 87.3, 8.8)
add("b2", 87.1, 15.4)
add("b2b", 87.4, 20.4)
add("b3", 87.6, 25.5)
add("b4", 91.6, 30.1)
add("b4b", 94.8, 35.2)
add("b5", 96.9, 40.1)
add("r9", 94.2, 47.0, "room")
add("b6", 92.5, 49.6)
add("r10", 89.5, 57.8, "room", 2, 2)
add("b7", 85.6, 67.8)
add("b8", 90.2, 71.0)
add("b8b", 93.0, 76.5)
add("r11", 94.0, 81.2, "room")  # litter door
add("b9", 93.7, 89.7)
add("b10", 90.1, 94.6)
add("b10b", 84.2, 94.2)
add("b11", 78.5, 93.8)
add("b12", 68.8, 95.6)
add("b13", 63.5, 94.9)
add("r12", 60.0, 89.4, "room", 3, 2)
add("b14", 56.0, 91.8)
add("b15", 51.3, 90.1)
add("b16", 46.2, 92.8)
add("b16b", 41.0, 93.6)
add("b17", 44.3, 89.3)
add("b18", 36.1, 94.5)
add("r13", 28.0, 93.1, "room")
add("b19", 21.6, 85.8)

# --- Inner from first door, lower belt toward white-cat door ---
add("c1", 24.5, 71.9)
add("c1b", 20.8, 66.2)
add("r14", 29.8, 64.9, "room", 3, 1)
add("c2", 33.3, 61.5)
add("c3", 38.6, 59.5)
add("r15", 39.8, 62.8, "room", 3, 1)
add("c4", 47.4, 65.6)
add("c5", 52.2, 67.0)
add("c6", 55.6, 68.7)
add("c7", 59.4, 68.8)
add("c8", 64.0, 68.2)
add("c9", 69.4, 65.7)
add("r16", 74.0, 57.9, "room", 2, 2)  # white-cat door
add("c10", 78.5, 61.8)  # white cat silhouette
add("c11", 68.2, 73.8)
add("c12", 71.3, 78.2)
add("c13", 76.3, 84.8)

# --- Inner-left climb (3r1y river) ---
add("d1", 17.8, 61.0)
add("r17", 19.3, 51.5, "room", 3, 1)
add("d2", 24.0, 53.3)
add("d3", 28.7, 53.7)
add("d4", 20.4, 46.3)
add("d5", 22.0, 41.7)
add("d5b", 25.5, 36.8)
add("r18", 29.0, 32.1, "room")
add("d6", 37.4, 28.6)
add("d7", 38.1, 39.9)
add("r19", 40.8, 44.8, "room")
add("d8", 45.2, 48.3)  # gray cat
add("d9", 39.1, 54.4)
add("r20", 54.9, 44.1, "room")
add("d10", 63.5, 46.6)
add("d11", 68.8, 52.0)

# --- Upper inner river ---
add("e1", 44.3, 17.4)
add("e2", 49.5, 15.2)
add("e3", 53.7, 10.9)
add("e4", 49.0, 22.1)
add("e5", 42.9, 25.5)
add("e6", 52.7, 25.4)
add("e7", 56.4, 25.4)
add("r21", 60.5, 28.7, "room", 3, 2)
add("e9b", 64.2, 24.6)
add("e8", 57.4, 18.2)
add("e9", 67.6, 14.8)
add("e10", 71.1, 20.5)
add("e11", 74.1, 16.5)
add("e12", 77.0, 21.2)
add("e13", 81.7, 9.9)
add("r22", 77.5, 27.2, "room", 2, 2)
add("e14", 77.0, 31.8)
add("e15", 66.9, 34.3)
add("e16", 69.8, 36.5)
add("e17", 73.3, 40.1)
add("e18", 81.6, 41.9)
add("e19", 82.2, 46.6)
add("e20", 79.2, 50.8)

chains = [
    # outer to dragon
    ["start", "a1", "r1", "a2", "a3", "r2", "a4", "a5", "r3", "a6", "a7", "r4",
     "a8", "r5", "a8c", "a9", "r6", "a10", "a11", "a12", "r7", "a13", "a14", "r8",
     "a15", "a16", "a17", "a18", "dragon"],
    # top-right fork down the right, along the bottom, into the first door
    ["a17", "b1", "b2", "b2b", "b3", "b4", "b4b", "b5", "r9", "b6", "r10", "b7", "b8", "b8b", "r11",
     "b9", "b10", "b10b", "b11", "b12", "b13", "r12", "b14", "b15", "b17", "b16", "b16b", "b18",
     "r13", "b19", "r1"],
    # inner belt from first door
    ["r1", "c1", "r14", "c2", "c3", "r15", "c4", "c5", "c6", "c7", "c8", "c9", "r16"],
    ["c1", "c1b", "d1", "r17"],
    ["r16", "c10", "b7"],
    ["r16", "c9", "c11", "c12", "c13", "b11"],
    # inner-left door and river
    ["r17", "d2", "d3", "c2"],
    ["r17", "d4", "d5", "d5b", "r18", "d6", "e5"],
    ["r18", "d7", "r19", "d8", "r20", "d10", "d11", "r16"],
    ["r19", "d9", "r15"],
    ["r15", "d9", "d8"],
    # upper inner toward dragon approach
    ["r7", "e3", "e2", "e1", "e4", "e5", "e6", "e7", "r21"],
    ["e3", "e8", "r21"],
    ["r21", "e9b", "e10", "e11", "e12", "r22"],
    ["e8", "e9", "e10"],
    ["r21", "e15"],
    ["e11", "e13", "a16"],
    ["r22", "e14", "e16", "e17", "e18", "e19", "e20", "r16"],
    ["e14", "e15", "r21"],
    ["e20", "c10"],
    ["r14", "c2"],
    ["c8", "c11"],
    ["b16", "b17"],
]

# climb links so inner paths can reach the dragon (one-way along diamonds toward the hoard)
extra = [
    ("e13", "a17"),
    ("e19", "r10"),
    ("c10", "r10"),
]

# de-dupe extra vs chains later

def dist(a, b):
    A = next(s for s in S if s[0] == a)
    B = next(s for s in S if s[0] == b)
    return math.hypot(A[1] - B[1], A[2] - B[2])

ids = {s[0] for s in S}
links = []
seen = set()
for ch in chains:
    for a, b in zip(ch, ch[1:]):
        if a not in ids or b not in ids:
            raise SystemExit(f"missing {a} or {b}")
        k = (a, b)
        if k not in seen:
            seen.add(k)
            links.append(k)
for a, b in extra:
    if a not in ids or b not in ids:
        continue
    k = (a, b)
    if k not in seen:
        seen.add(k)
        links.append(k)

print("spaces", len(S), "rooms", sum(1 for s in S if s[3] == "room"), "links", len(links))
longs = [(a, b, dist(a, b)) for a, b in links if dist(a, b) > 9.0]
print("long links (>9%)")
for a, b, d in sorted(longs, key=lambda x: -x[2]):
    print(f"  {a} -> {b}  {d:.1f}%")

from collections import defaultdict, deque
fwd = defaultdict(list)
und = defaultdict(set)
for a, b in links:
    fwd[a].append(b)
    und[a].add(b)
    und[b].add(a)

def bfs(start, adj):
    seen = {start}
    q = deque([start])
    while q:
        cur = q.popleft()
        for n in adj[cur]:
            if n not in seen:
                seen.add(n)
                q.append(n)
    return seen

reach = bfs("start", fwd)
print("player-reachable from start", len(reach), "/", len(S), "dragon" in reach)
print("unreachable", sorted(ids - reach))
cat_reach = bfs("a14", und)
print("cat-connected from angel", len(cat_reach), "/", len(S), "missing", sorted(ids - cat_reach))

# overlay
im = Image.open(ROOT / "public" / "assets" / "DD3-Board.png").convert("RGB")
w, h = im.size
out = im.copy()
dr = ImageDraw.Draw(out)
by = {s[0]: s for s in S}
for a, b in links:
    x1, y1 = by[a][1] / 100 * w, by[a][2] / 100 * h
    x2, y2 = by[b][1] / 100 * w, by[b][2] / 100 * h
    dr.line([x1, y1, x2, y2], fill=(0, 220, 255), width=2)
for i, x, y, kind, red, yel in S:
    px, py = x / 100 * w, y / 100 * h
    col = {"room": (255, 50, 50), "dragon": (255, 210, 0), "start": (80, 255, 80)}.get(kind, (255, 0, 255))
    dr.ellipse([px - 9, py - 9, px + 9, py + 9], outline=col, width=3)
    dr.text((px + 11, py - 10), i, fill=(255, 255, 40))
out.save(ROOT / "_overlay_new.png")
print("wrote _overlay_new.png")

# emit board.js
lines = []
lines.append('/**')
lines.append(" * Board graph aligned to DD3 Board.png (1267x1267).")
lines.append(" * Coordinates are image percentages. Players follow `next` (blue diamonds).")
lines.append(" * Rooms are wooden-door spaces only. Cats walk the undirected graph.")
lines.append(" */")
lines.append("")
lines.append("function S(id, x, y, extra = {}) {")
lines.append("  return {")
lines.append("    id,")
lines.append("    x,")
lines.append("    y,")
lines.append("    type: extra.type || \"path\",")
lines.append("    stop: extra.type === \"room\" || extra.type === \"dragon\",")
lines.append("    red: extra.red || 0,")
lines.append("    yellow: extra.yellow || 0,")
lines.append("    next: [],")
lines.append("  };")
lines.append("}")
lines.append("")
lines.append("function buildSpaces() {")
lines.append("  return [")
for i, x, y, kind, red, yel in S:
    extra = []
    if kind != "path":
        extra.append(f'type: "{kind}"')
    if red:
        extra.append(f"red: {red}")
    if yel:
        extra.append(f"yellow: {yel}")
    if extra:
        lines.append(f'    S("{i}", {x:.1f}, {y:.1f}, {{ {", ".join(extra)} }}),')
    else:
        lines.append(f'    S("{i}", {x:.1f}, {y:.1f}),')
lines.append("  ];")
lines.append("}")
lines.append("")
lines.append("function link(spaces, a, b) {")
lines.append("  if (!spaces[a] || !spaces[b]) throw new Error(`bad link ${a} -> ${b}`);")
lines.append("  if (!spaces[a].next.includes(b)) spaces[a].next.push(b);")
lines.append("}")
lines.append("")
lines.append("function chain(spaces, ids) {")
lines.append("  for (let i = 0; i < ids.length - 1; i++) link(spaces, ids[i], ids[i + 1]);")
lines.append("}")
lines.append("")
lines.append("function buildBoard() {")
lines.append("  const spaces = {};")
lines.append("  for (const s of buildSpaces()) spaces[s.id] = s;")
lines.append("")
for ch in chains:
    inner = ", ".join(f'"{x}"' for x in ch)
    lines.append(f"  chain(spaces, [{inner}]);")
for a, b in extra:
    if (a, b) in {(x, y) for ch in chains for x, y in zip(ch, ch[1:])}:
        continue
    lines.append(f'  link(spaces, "{a}", "{b}");')
lines.append("")
lines.append("  const catSpawns = {")
lines.append('    angel: "a14",')
lines.append('    alex: "d8",')
lines.append('    lily: "c10",')
lines.append("  };")
lines.append("")
lines.append("  const roomIds = Object.values(spaces).filter((s) => s.type === \"room\").map((s) => s.id);")
lines.append("  const adj = {};")
lines.append("  for (const id of Object.keys(spaces)) adj[id] = new Set();")
lines.append("  for (const s of Object.values(spaces)) {")
lines.append("    for (const n of s.next) {")
lines.append("      adj[s.id].add(n);")
lines.append("      adj[n].add(s.id);")
lines.append("    }")
lines.append("  }")
lines.append("  const undirected = {};")
lines.append("  for (const id of Object.keys(adj)) undirected[id] = [...adj[id]];")
lines.append("")
lines.append("  return {")
lines.append("    spaces,")
lines.append("    roomIds,")
lines.append("    catSpawns,")
lines.append("    undirected,")
lines.append('    startId: "start",')
lines.append('    dragonId: "dragon",')
lines.append("  };")
lines.append("}")
lines.append("")
lines.append("const BOARD = buildBoard();")
lines.append("")
lines.append("function getSpace(id) {")
lines.append("  return BOARD.spaces[id];")
lines.append("}")
lines.append("")
lines.append("function playerNeighbors(id) {")
lines.append("  return (BOARD.spaces[id] && BOARD.spaces[id].next) || [];")
lines.append("}")
lines.append("")
lines.append("function catNeighbors(id) {")
lines.append("  return BOARD.undirected[id] || [];")
lines.append("}")
lines.append("")
lines.append("function shortestCatPath(from, to) {")
lines.append("  if (from === to) return [from];")
lines.append("  const q = [[from]];")
lines.append("  const seen = new Set([from]);")
lines.append("  while (q.length) {")
lines.append("    const path = q.shift();")
lines.append("    const cur = path[path.length - 1];")
lines.append("    for (const n of catNeighbors(cur)) {")
lines.append("      if (seen.has(n)) continue;")
lines.append("      const next = path.concat(n);")
lines.append("      if (n === to) return next;")
lines.append("      seen.add(n);")
lines.append("      q.push(next);")
lines.append("    }")
lines.append("  }")
lines.append("  return null;")
lines.append("}")
lines.append("")
lines.append("function reachablePlayer(from, steps, stopOnRoom = true) {")
lines.append("  const out = [];")
lines.append("  const q = [{ id: from, left: steps, path: [from], stopped: false }];")
lines.append("  const seen = new Set([`${from}|${steps}`]);")
lines.append("  while (q.length) {")
lines.append("    const cur = q.shift();")
lines.append("    if (cur.id !== from) out.push(cur);")
lines.append("    if (cur.stopped || cur.left <= 0) continue;")
lines.append("    for (const n of playerNeighbors(cur.id)) {")
lines.append("      const sp = getSpace(n);")
lines.append("      const stopped = !!(stopOnRoom && sp && sp.stop);")
lines.append("      const left = cur.left - 1;")
lines.append("      const key = `${n}|${left}|${stopped}`;")
lines.append("      if (seen.has(key)) continue;")
lines.append("      seen.add(key);")
lines.append("      q.push({ id: n, left, path: cur.path.concat(n), stopped });")
lines.append("    }")
lines.append("  }")
lines.append("  return out;")
lines.append("}")
lines.append("")
lines.append("module.exports = {")
lines.append("  BOARD,")
lines.append("  getSpace,")
lines.append("  playerNeighbors,")
lines.append("  catNeighbors,")
lines.append("  shortestCatPath,")
lines.append("  reachablePlayer,")
lines.append("};")
lines.append("")

(ROOT / "server" / "engine" / "board.js").write_text("\n".join(lines), encoding="utf-8")
print("wrote board.js")
