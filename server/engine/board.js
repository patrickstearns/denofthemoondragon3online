/**
 * Board graph from board-data.json (edited visually at /board-editor.html).
 * Coordinates are image percentages. Players follow `next` (blue diamonds).
 * Rooms are wooden-door spaces only. Cats walk the undirected graph.
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "board-data.json");

function loadData() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  return raw;
}

function asSpace(s) {
  const type = s.type || "path";
  return {
    id: s.id,
    x: +s.x,
    y: +s.y,
    type,
    stop: type === "room" || type === "dragon",
    red: s.red || 0,
    yellow: s.yellow || 0,
    next: Array.isArray(s.next) ? s.next.filter(Boolean) : [],
  };
}

function buildBoard(data) {
  data = data || loadData();
  const spaces = {};
  for (const s of data.spaces || []) spaces[s.id] = asSpace(s);
  for (const s of Object.values(spaces)) {
    s.next = s.next.filter((id) => spaces[id] && id !== s.id);
  }

  const startId = data.startId || Object.values(spaces).find((s) => s.type === "start")?.id || "start";
  const dragonId = data.dragonId || Object.values(spaces).find((s) => s.type === "dragon")?.id || "dragon";
  const catSpawns = {
    angel: data.catSpawns?.angel || startId,
    alex: data.catSpawns?.alex || startId,
    lily: data.catSpawns?.lily || startId,
  };

  const roomIds = Object.values(spaces).filter((s) => s.type === "room").map((s) => s.id);
  const adj = {};
  for (const id of Object.keys(spaces)) adj[id] = new Set();
  for (const s of Object.values(spaces)) {
    for (const n of s.next) {
      adj[s.id].add(n);
      adj[n].add(s.id);
    }
  }
  const undirected = {};
  for (const id of Object.keys(adj)) undirected[id] = [...adj[id]];

  const props = Array.isArray(data.props) ? data.props.map((p) => ({
    id: String(p.id),
    kind: String(p.kind),
    x: +p.x,
    y: +p.y,
    scale: p.scale == null ? 1 : +p.scale,
    rot: p.rot == null ? 0 : +p.rot,
  })) : [];

  return {
    spaces,
    roomIds,
    catSpawns,
    undirected,
    startId,
    dragonId,
    props,
  };
}

const BOARD = buildBoard();

function reloadBoard() {
  const next = buildBoard();
  BOARD.spaces = next.spaces;
  BOARD.roomIds = next.roomIds;
  BOARD.catSpawns = next.catSpawns;
  BOARD.undirected = next.undirected;
  BOARD.startId = next.startId;
  BOARD.dragonId = next.dragonId;
  BOARD.props = next.props;
  return BOARD;
}

function getSpace(id) {
  return BOARD.spaces[id];
}

function playerNeighbors(id) {
  return (BOARD.spaces[id] && BOARD.spaces[id].next) || [];
}

function catNeighbors(id) {
  return BOARD.undirected[id] || [];
}

function shortestCatPath(from, to) {
  if (from === to) return [from];
  const q = [[from]];
  const seen = new Set([from]);
  while (q.length) {
    const path = q.shift();
    const cur = path[path.length - 1];
    for (const n of catNeighbors(cur)) {
      if (seen.has(n)) continue;
      const next = path.concat(n);
      if (n === to) return next;
      seen.add(n);
      q.push(next);
    }
  }
  return null;
}

function reachablePlayer(from, steps, stopOnRoom = true) {
  const out = [];
  const q = [{ id: from, left: steps, path: [from], stopped: false }];
  const seen = new Set([`${from}|${steps}`]);
  while (q.length) {
    const cur = q.shift();
    if (cur.id !== from) out.push(cur);
    if (cur.stopped || cur.left <= 0) continue;
    for (const n of playerNeighbors(cur.id)) {
      const sp = getSpace(n);
      const stopped = !!(stopOnRoom && sp && sp.stop);
      const left = cur.left - 1;
      const key = `${n}|${left}|${stopped}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push({ id: n, left, path: cur.path.concat(n), stopped });
    }
  }
  return out;
}

module.exports = {
  BOARD,
  DATA_FILE,
  loadData,
  reloadBoard,
  getSpace,
  playerNeighbors,
  catNeighbors,
  shortestCatPath,
  reachablePlayer,
};
