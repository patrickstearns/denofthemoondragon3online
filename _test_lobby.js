const { io } = require("socket.io-client");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function client(name) {
  const socket = io(process.env.TEST_URL || "http://127.0.0.1:3010", { transports: ["websocket"] });
  const ev = {};
  socket.onAny((e, ...a) => {
    ev.last = { e, a };
    if (e === "lobby:state") ev.lobby = a[0];
    if (e === "auth:ok") ev.auth = a[0];
    if (e === "game:joined") ev.joined = a[0];
    if (e === "game:lobby") ev.room = a[0];
    if (e === "game:state") ev.state = a[0];
    if (e === "game:error") ev.err = a[0];
  });
  return { socket, ev, name };
}

async function once(pred, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = pred();
    if (v) return v;
    await wait(40);
  }
  throw new Error("timeout");
}

(async () => {
  const a = client("Dragon");
  const b = client("Scout");
  const URL = process.env.TEST_URL || "http://127.0.0.1:3010";

  a.socket.emit("auth:hello", { name: "Dragon" });
  b.socket.emit("auth:hello", { name: "Scout" });
  await once(() => a.ev.auth && b.ev.auth);
  a.socket.emit("game:create");
  const joined = await once(() => a.ev.joined);
  const gameId = joined.room.id;
  a.socket.emit("game:setSeat", { gameId, seat: 1, mode: "human" });
  a.socket.emit("game:setSeat", { gameId, seat: 2, mode: "ai" });
  a.socket.emit("game:setSeat", { gameId, seat: 3, mode: "closed" });
  await wait(200);
  b.socket.emit("game:join", { gameId });
  await once(() => b.ev.joined);
  a.socket.emit("game:start", { gameId });
  const st = await once(() => a.ev.state && a.ev.state.phase && a.ev.state);
  console.log("phase", st.phase, "prompt", st.prompt && st.prompt.type, "players", st.players.map((p) => p.name));
  if (st.prompt && st.prompt.type === "pickCharacter") {
    a.socket.emit("game:action", { gameId, action: { type: "pickCharacter", characterId: st.prompt.options[0] } });
  }
  const stB = await once(() => b.ev.state && b.ev.state.prompt && b.ev.state.prompt.type === "pickCharacter" && b.ev.state.prompt.seat === 1 && b.ev.state);
  b.socket.emit("game:action", { gameId, action: { type: "pickCharacter", characterId: stB.prompt.options[0] } });
  const playing = await once(() => a.ev.state && a.ev.state.phase === "play" && a.ev.state);
  console.log("playing", playing.phase, playing.prompt && playing.prompt.type, playing.players.map((p) => p.name + ":" + (p.characterId || "-")));
  a.socket.close();
  b.socket.close();
  console.log("ok lobby+start");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
