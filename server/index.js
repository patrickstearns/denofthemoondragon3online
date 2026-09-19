const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { createMatch, applyAction, publicState, tick } = require("./engine/game");
const { maybeAct } = require("./ai");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.use(express.json({ limit: "1mb" }));

const PUBLIC = path.join(__dirname, "..", "public");
const ASSET_V = String(Date.now());

function sendIndex(_req, res) {
  const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8")
    .replace(/\/css\/style\.css\?v=[^"]+/, `/css/style.css?v=${ASSET_V}`)
    .replace(/\/js\/client\.js\?v=[^"]+/, `/js/client.js?v=${ASSET_V}`);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.type("html").send(html);
}

app.get("/", sendIndex);
app.get("/index.html", sendIndex);
app.use(express.static(PUBLIC, {
  etag: false,
  lastModified: false,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  },
}));
app.get("/health", (_req, res) => res.json({ ok: true }));

const { DATA_FILE, loadData, reloadBoard } = require("./engine/board");

app.get("/api/board", (_req, res) => {
  try {
    res.json(loadData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/board", (req, res) => {
  const data = req.body || {};
  const spaces = Array.isArray(data.spaces) ? data.spaces : [];
  const ids = new Set();
  for (const s of spaces) {
    if (!s || !s.id || ids.has(s.id)) {
      return res.status(400).json({ error: "Each space needs a unique id." });
    }
    ids.add(s.id);
  }
  const starts = spaces.filter((s) => s.type === "start");
  const dragons = spaces.filter((s) => s.type === "dragon");
  if (starts.length !== 1 || dragons.length !== 1) {
    return res.status(400).json({ error: "Need exactly one Start space and one Dragon space." });
  }
  const prev = (() => { try { return loadData(); } catch (_) { return {}; } })();
  const cleanProps = Array.isArray(data.props) && data.props.length
    ? data.props.filter((p) => p && p.id && p.kind).map((p) => ({
      id: String(p.id),
      kind: String(p.kind),
      x: +p.x,
      y: +p.y,
      scale: p.scale == null ? 1 : +p.scale,
      rot: p.rot == null ? 0 : +p.rot,
    }))
    : (prev.props || []);
  const clean = {
    spaces: spaces.map((s) => ({
      id: String(s.id),
      x: +s.x,
      y: +s.y,
      type: s.type || "path",
      red: +s.red || 0,
      yellow: +s.yellow || 0,
      next: Array.isArray(s.next) ? s.next.filter((n) => ids.has(n) && n !== s.id) : [],
    })),
    catSpawns: {
      angel: data.catSpawns?.angel || starts[0].id,
      alex: data.catSpawns?.alex || starts[0].id,
      lily: data.catSpawns?.lily || starts[0].id,
    },
    startId: starts[0].id,
    dragonId: dragons[0].id,
    props: cleanProps,
  };
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(clean, null, 2));
    reloadBoard();
    res.json({ ok: true, spaces: clean.spaces.length, rooms: clean.spaces.filter((s) => s.type === "room").length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

/** @type {Map<string, { id: string, name: string, socketId: string, ip?: string, geo?: string }>} */
const players = new Map();
const geoCache = new Map();

function clientIp(socket) {
  const xf = socket.handshake.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim().replace(/^::ffff:/, "");
  const raw = socket.handshake.address || socket.conn?.remoteAddress || "";
  return String(raw).replace(/^::ffff:/, "");
}

function isPrivateIp(ip) {
  const v = String(ip || "");
  if (!v || v === "127.0.0.1" || v === "::1" || v === "localhost" || v === "::") return true;
  if (/^10\./.test(v) || /^192\.168\./.test(v) || /^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v === "0.0.0.0" || /^169\.254\./.test(v) || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  return false;
}

function geoLabel(data) {
  const city = data.city || data.cityName;
  const region = data.regionName || data.region;
  const country = data.country || data.country_name;
  if (city && country) return `${city}, ${country}`;
  if (region && country) return `${region}, ${country}`;
  return country || "Unknown";
}

async function lookupGeo(ip) {
  if (!ip || isPrivateIp(ip)) return "Local network";
  if (geoCache.has(ip)) return geoCache.get(ip);
  const urls = [
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
  ];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "fail" || data.error) continue;
      const label = geoLabel(data);
      geoCache.set(ip, label);
      return label;
    } catch (_) { /* try next */ }
  }
  return "Unknown";
}

function attachGeo(player, socket) {
  const ip = clientIp(socket);
  player.ip = ip;
  if (!player.geo) player.geo = isPrivateIp(ip) ? "Local network" : "Looking up…";
  lookupGeo(ip).then((label) => {
    if (players.get(player.id) !== player) return;
    if (player.geo === label) return;
    player.geo = label;
    broadcastLobby();
  });
}
/** @type {Map<string, GameRoom>} */
const games = new Map();
let gameSeq = 1;

function nid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

function lobbySnapshot() {
  const waiting = [];
  const active = [];
  for (const g of games.values()) {
    const row = {
      id: g.id,
      name: g.name,
      status: g.status,
      creator: g.creatorName,
      seats: g.seats.map((s) => ({
        index: s.index,
        mode: s.mode,
        name: s.playerName,
      })),
      playerCount: g.seats.filter((s) => s.mode === "human" && s.playerId).length,
    };
    if (g.status === "lobby") waiting.push(row);
    else active.push(row);
  }
  return {
    players: [...players.values()].map((p) => ({ id: p.id, name: p.name, geo: p.geo || "" })),
    games: { waiting, active },
  };
}

function broadcastLobby() {
  io.emit("lobby:state", lobbySnapshot());
}

function roomView(g, playerId) {
  return {
    id: g.id,
    name: g.name,
    status: g.status,
    creatorId: g.creatorId,
    seats: g.seats.map((s) => ({
      index: s.index,
      mode: s.mode,
      playerId: s.playerId,
      playerName: s.playerName,
      you: s.playerId === playerId,
    })),
  };
}

function emitGame(g) {
  if (g.status === "lobby") {
    io.to(g.id).emit("game:lobby", { room: roomView(g, null) });
    return;
  }
  if (!g.match) return;
  io.in(g.id).fetchSockets().then((socks) => {
    for (const s of socks) {
      const pid = s.data.playerId;
      s.emit("game:state", publicState(g.match, pid));
    }
  });
}

function kickIfEmpty(g) {
  const humans = g.seats.some((s) => s.mode === "human" && s.playerId);
  if (!humans && g.status === "lobby") {
    games.delete(g.id);
  }
}

function seatedHumans(g) {
  return g.seats.filter((s) => s.mode === "human" && s.playerId);
}

function runAiLoop(g) {
  if (!g.match || g.status === "ended") return;
  let guard = 0;
  const step = () => {
    if (!g.match || g.status === "ended") return;
    tick(g.match);
    const res = maybeAct(g.match);
    if (res && g.match.phase === "end") g.status = "ended";
    emitGame(g);
    if (g.match.phase === "end") {
      broadcastLobby();
      return;
    }
    const pr = g.match.prompt;
    const race = g.match.reaction && (g.match.reaction.type === "double" || g.match.reaction.type === "cup");
    const sig = (pr && pr.type) + ":" + (pr && pr.seat) + ":" + (g.match.reaction && g.match.reaction.type);
    if (g._aiSig !== sig) {
      g._aiSig = sig;
      guard = 0;
    }
    const aiTurn =
      g.match.reaction ||
      (pr && pr.seat != null && g.match.players.find((p) => p.seat === pr.seat)?.isAI);
    if (aiTurn && guard++ < 120) {
      g.aiTimer = setTimeout(step, race ? 80 : 550 + Math.random() * 500);
    }
  };
  clearTimeout(g.aiTimer);
  const raceNow = g.match.reaction && (g.match.reaction.type === "double" || g.match.reaction.type === "cup");
  g.aiTimer = setTimeout(step, raceNow ? 80 : 400);
}

class GameRoom {
  constructor({ creatorId, creatorName }) {
    this.id = nid("g");
    this.name = `${creatorName}'s Den`;
    this.creatorId = creatorId;
    this.creatorName = creatorName;
    this.status = "lobby";
    this.seats = [
      { index: 0, mode: "human", playerId: creatorId, playerName: creatorName },
      { index: 1, mode: "closed", playerId: null, playerName: null },
      { index: 2, mode: "closed", playerId: null, playerName: null },
      { index: 3, mode: "closed", playerId: null, playerName: null },
    ];
    this.match = null;
    this.aiTimer = null;
    this.tickTimer = null;
  }
}

function startTick(g) {
  clearInterval(g.tickTimer);
  g.tickTimer = setInterval(() => {
    if (!g.match || g.status === "lobby") return;
    const r = tick(g.match);
    if (r.changed) {
      emitGame(g);
      runAiLoop(g);
    }
    if (g.match.phase === "end") {
      g.status = "ended";
      broadcastLobby();
    }
  }, 250);
}

io.on("connection", (socket) => {
  socket.data.playerId = null;

  socket.on("auth:hello", ({ name, playerId } = {}) => {
    const n = String(name || "").trim().slice(0, 24);
    if (!n) {
      socket.emit("auth:error", { error: "Enter a name." });
      return;
    }
    let id = playerId && String(playerId);
    if (!id || [...players.values()].some((p) => p.id === id && p.socketId !== socket.id)) {
      id = nid("p");
    }
    const existing = [...players.values()].find((p) => p.id === id);
    if (existing) {
      existing.socketId = socket.id;
      existing.name = n;
      attachGeo(existing, socket);
    } else {
      const rec = { id, name: n, socketId: socket.id };
      players.set(id, rec);
      attachGeo(rec, socket);
    }
    socket.data.playerId = id;
    socket.data.name = n;
    socket.join("lobby");
    socket.emit("auth:ok", { playerId: id, name: n });
    broadcastLobby();

    for (const g of games.values()) {
      if (g.seats.some((s) => s.playerId === id) && g.match) {
        socket.join(g.id);
        socket.emit("game:joined", { room: roomView(g, id) });
        socket.emit("game:state", publicState(g.match, id));
      }
    }
  });

  socket.on("game:create", () => {
    const id = socket.data.playerId;
    const p = players.get(id);
    if (!p) return;
    const g = new GameRoom({ creatorId: id, creatorName: p.name });
    games.set(g.id, g);
    socket.join(g.id);
    socket.emit("game:joined", { room: roomView(g, id) });
    broadcastLobby();
  });

  socket.on("game:join", ({ gameId }) => {
    const id = socket.data.playerId;
    const p = players.get(id);
    const g = games.get(gameId);
    if (!p || !g) {
      socket.emit("game:error", { error: "Game not found." });
      return;
    }
    if (g.status !== "lobby") {
      socket.emit("game:error", { error: "That game has already started." });
      return;
    }
    socket.join(g.id);
    const empty = g.seats.find((s) => s.mode === "human" && !s.playerId);
    if (empty && !g.seats.some((s) => s.playerId === id)) {
      empty.playerId = id;
      empty.playerName = p.name;
    }
    socket.emit("game:joined", { room: roomView(g, id) });
    io.to(g.id).emit("game:lobby", { room: roomView(g, null) });
    broadcastLobby();
  });

  socket.on("game:leave", ({ gameId } = {}) => {
    const id = socket.data.playerId;
    const g = games.get(gameId) || [...games.values()].find((x) => x.seats.some((s) => s.playerId === id));
    if (!g) return;
    socket.leave(g.id);
    if (g.match) {
      const mp = g.match.players.find((p) => p.id === id);
      if (mp && mp.status === "active") mp.isAI = true;
    }
    for (const s of g.seats) {
      if (s.playerId === id) {
        s.playerId = null;
        s.playerName = null;
      }
    }
    if (g.creatorId === id && g.status === "lobby") {
      games.delete(g.id);
    } else if (g.status === "playing" && !seatedHumans(g).length) {
      games.delete(g.id);
    } else {
      kickIfEmpty(g);
      if (games.has(g.id)) {
        io.to(g.id).emit("game:lobby", { room: roomView(g, null) });
        if (g.match) {
          emitGame(g);
          runAiLoop(g);
        }
      }
    }
    socket.emit("lobby:state", lobbySnapshot());
    broadcastLobby();
  });

  socket.on("game:setSeat", ({ gameId, seat, mode }) => {
    const id = socket.data.playerId;
    const g = games.get(gameId);
    if (!g || g.creatorId !== id || g.status !== "lobby") return;
    const s = g.seats[seat];
    if (!s || seat === 0) return;
    if (!["human", "ai", "closed"].includes(mode)) return;
    if (s.mode === "human" && s.playerId && mode !== "human") {
      s.playerId = null;
      s.playerName = null;
    }
    s.mode = mode;
    if (mode === "ai") {
      s.playerId = null;
      s.playerName = "AI";
    }
    if (mode === "closed") {
      s.playerId = null;
      s.playerName = null;
    }
    io.to(g.id).emit("game:lobby", { room: roomView(g, null) });
    broadcastLobby();
  });

  socket.on("game:sit", ({ gameId, seat }) => {
    const id = socket.data.playerId;
    const p = players.get(id);
    const g = games.get(gameId);
    if (!p || !g || g.status !== "lobby") return;
    const s = g.seats[seat];
    if (!s || s.mode !== "human") return;
    for (const x of g.seats) {
      if (x.playerId === id) {
        x.playerId = null;
        x.playerName = null;
      }
    }
    if (!s.playerId) {
      s.playerId = id;
      s.playerName = p.name;
    }
    io.to(g.id).emit("game:lobby", { room: roomView(g, null) });
    broadcastLobby();
  });

  socket.on("game:start", ({ gameId }) => {
    const id = socket.data.playerId;
    const g = games.get(gameId);
    if (!g || g.creatorId !== id || g.status !== "lobby") return;
    if (!seatedHumans(g).length) {
      socket.emit("game:error", { error: "Need at least one human." });
      return;
    }
    const seats = [];
    for (const s of g.seats) {
      if (s.mode === "closed") continue;
      if (s.mode === "human" && !s.playerId) continue;
      if (s.mode === "ai") {
        seats.push({
          seat: s.index,
          playerId: nid("ai"),
          name: `AI-${s.index + 1}`,
          isAI: true,
        });
      } else {
        seats.push({
          seat: s.index,
          playerId: s.playerId,
          name: s.playerName,
          isAI: false,
        });
      }
    }
    if (!seats.length) return;
    g.match = createMatch({ id: g.id, name: g.name, seats, rngSeed: Date.now() });
    g.status = "playing";
    startTick(g);
    emitGame(g);
    broadcastLobby();
    runAiLoop(g);
  });

  socket.on("game:action", ({ gameId, action }) => {
    const id = socket.data.playerId;
    const g = games.get(gameId);
    if (!g?.match) return;
    const res = applyAction(g.match, id, action || {});
    if (!res.ok) {
      socket.emit("game:error", { error: res.error || "Illegal action." });
      return;
    }
    if (g.match.phase === "end") g.status = "ended";
    emitGame(g);
    runAiLoop(g);
    if (g.status === "ended") broadcastLobby();
  });

  socket.on("disconnect", () => {
    const id = socket.data.playerId;
    if (!id) return;
    const p = players.get(id);
    if (p && p.socketId === socket.id) players.delete(id);
    broadcastLobby();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Dragon's Den III listening on ${HOST}:${PORT}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set PORT to another value, e.g. PORT=3010`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
