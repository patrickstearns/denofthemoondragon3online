const { createMatch, applyAction, legalActions, tick, publicState, CHARACTERS } = require("./server/engine/game");
const { maybeAct } = require("./server/ai");
const { BOARD } = require("./server/engine/board");

function assertBoard() {
  for (const s of Object.values(BOARD.spaces)) {
    for (const n of s.next) {
      if (!BOARD.spaces[n]) throw new Error(`broken link ${s.id} -> ${n}`);
    }
  }
  const rooms = Object.values(BOARD.spaces).filter((s) => s.type === "room");
  console.log("spaces", Object.keys(BOARD.spaces).length, "rooms", rooms.length);
}

function flushHolds(state) {
  let n = 0;
  while (n++ < 20) {
    const t = state.prompt && state.prompt.type;
    if (t === "combatResult" && state.combatResult && (state.combatResult.catHit || state.combatResult.catWound || state.combatResult.catDump)) {
      const actor = state.players.find((p) => !p.isAI) || state.players.find((p) => p.seat === state.prompt.seat) || state.players[0];
      applyAction(state, actor.id, { type: "continue" });
      continue;
    }
    if (t === "combatBoost") {
      const actor = state.players.find((p) => p.seat === state.prompt.seat) || state.players[0];
      applyAction(state, actor.id, { type: "continue" });
      continue;
    }
    if (!["walkWait", "catAnnounce", "fightAnnounce", "turnAnnounce", "denizenReveal", "diceWait", "combatPause", "deathAnnounce"].includes(t)) break;
    tick(state, Date.now() + 100000);
  }
}

function play() {
  const state = createMatch({
    id: "t",
    name: "test",
    rngSeed: 42,
    seats: [
      { seat: 0, playerId: "ai-0", name: "Dragon", isAI: true },
      { seat: 1, playerId: "ai-1", name: "Bob", isAI: true },
    ],
  });
  let n = 0;
  let stuck = 0;
  while (state.phase !== "end" && n < 2500) {
    n++;
    tick(state, Date.now() + 100000);
    const before = JSON.stringify(state.prompt) + (state.reaction && state.reaction.type);
    const res = maybeAct(state);
    if (state.phase === "end") break;
    const after = JSON.stringify(state.prompt) + (state.reaction && state.reaction.type);
    if (!res && before === after) {
      stuck++;
      if (stuck > 8) {
        const actor = state.players.find((p) => p.seat === state.prompt?.seat);
        console.log("STUCK", state.prompt, actor && actor.name, actor && legalActions(state, actor.id));
        break;
      }
    } else stuck = 0;
  }
  console.log("steps", n, "phase", state.phase, "winners", state.winners);
  console.log(state.log.slice(-8).map((l) => l.text).join("\n"));
  const view = publicState(state, "ai-0");
  console.log("view players", view.players.map((p) => p.name + " " + p.status));
}

function testCatAfterSpace() {
  const rng = () => 0;
  const state = createMatch({
    id: "cat-order",
    name: "cat-order",
    rngSeed: rng,
    seats: [
      { seat: 0, playerId: "h0", name: "Dragon", isAI: false },
      { seat: 1, playerId: "ai-1", name: "Bob", isAI: true },
    ],
  });
  applyAction(state, "h0", { type: "pickCharacter", characterId: "cleric" });
  let guard = 0;
  while (state.phase !== "play" && guard++ < 20) {
    tick(state, Date.now() + 100000);
    maybeAct(state);
  }
  flushHolds(state);
  if (state.prompt?.type !== "preMove") throw new Error("expected preMove, got " + state.prompt?.type);
  applyAction(state, "h0", { type: "rollMove" });
  tick(state, Date.now() + 100000);
  if (state.turn.primaryDie !== 1) throw new Error("expected die 1");
  if (state.prompt?.type === "catPick") throw new Error("cats moved before the player finished moving");
  let hops = 0;
  while (hops++ < 40) {
    flushHolds(state);
    if (state.prompt?.type !== "move") break;
    const dest = state.prompt.options[0];
    applyAction(state, "h0", { type: "move", spaceId: dest });
  }
  flushHolds(state);
  if (state.prompt?.type === "roomReveal") {
    applyAction(state, "h0", { type: "continue" });
    guard = 0;
    while (state.prompt && state.prompt.type !== "catPick" && guard++ < 40) {
      flushHolds(state);
      if (state.prompt?.type === "catPick") break;
      if (["diceWait", "combatPause", "deathAnnounce"].includes(state.prompt.type)) {
        tick(state, Date.now() + 100000);
        continue;
      }
      if (state.prompt.type === "combatBoost") {
        const actor = state.players.find((p) => p.seat === state.prompt.seat) || state.players.find((p) => p.id === "h0") || state.players[0];
        applyAction(state, actor.id, { type: "continue" });
        continue;
      }
      if (state.prompt.type === "combatResult" || state.prompt.type === "lootResult" || state.prompt.type === "raceResult") {
        const actor = state.players.find((p) => p.seat === state.prompt.seat) || state.players.find((p) => p.id === "h0") || state.players[0];
        applyAction(state, actor.id, { type: "continue" });
        continue;
      }
      if (state.prompt.type === "overCarry") {
        const actor = state.players.find((p) => p.seat === state.prompt.seat);
        const acts = legalActions(state, actor.id);
        const dump = acts.find((a) => a.type === "overCarry");
        if (dump) applyAction(state, actor.id, dump);
        else break;
        continue;
      }
      if (state.prompt.type === "roomReveal" || state.prompt.type === "denizenReveal") {
        const actor = state.players.find((p) => p.seat === state.prompt.seat);
        applyAction(state, actor.id, { type: "continue" });
        continue;
      }
      const actor = state.players.find((p) => p.seat === state.prompt.seat);
      const acts = legalActions(state, actor.id);
      const pickAct = acts.find((a) => a.type === "resolveCombat") || acts.find((a) => a.type === "chooseStat") || acts[0];
      if (!pickAct) break;
      applyAction(state, actor.id, pickAct);
      tick(state, Date.now() + 100000);
    }
  }
  if (state.prompt?.type !== "catPick") {
    throw new Error("expected catPick after space resolve, got " + (state.prompt && state.prompt.type));
  }
  console.log("cat-after-space ok");
}

function testDoubleResumesMove() {
  const rng = () => 0;
  const state = createMatch({
    id: "dbl",
    name: "dbl",
    rngSeed: rng,
    seats: [
      { seat: 0, playerId: "h0", name: "Dragon", isAI: false },
      { seat: 1, playerId: "ai-1", name: "Bob", isAI: true },
    ],
  });
  applyAction(state, "h0", { type: "pickCharacter", characterId: "cleric" });
  let guard = 0;
  while (state.phase !== "play" && guard++ < 20) {
    tick(state, Date.now() + 100000);
    maybeAct(state);
  }
  flushHolds(state);
  if (state.prompt?.type !== "preMove") throw new Error("expected preMove, got " + (state.prompt && state.prompt.type));
  state.lastDie = 1;
  applyAction(state, "h0", { type: "rollMove" });
  guard = 0;
  while (guard++ < 60) {
    if (state.prompt?.type === "move" && state.prompt.seat === 0 && (state.prompt.options || []).length) break;
    if (state.prompt?.type === "walkWait" || state.prompt?.type === "catAnnounce" || state.prompt?.type === "diceWait" || state.prompt?.type === "turnAnnounce") {
      tick(state, Date.now() + 100000);
      continue;
    }
    if (state.prompt?.type === "raceResult") {
      applyAction(state, "h0", { type: "continue" });
      tick(state, Date.now() + 100000);
      continue;
    }
    if (state.prompt?.type === "doubleCat") {
      const actor = state.players.find((p) => p.seat === state.prompt.seat);
      const acts = legalActions(state, actor.id);
      const mv = acts.find((a) => a.type === "doubleCat");
      if (mv) applyAction(state, actor.id, mv);
      else tick(state, Date.now() + 100000);
      continue;
    }
    tick(state, Date.now() + 100000);
    maybeAct(state);
  }
  if (state.prompt?.type !== "move" || state.prompt.seat !== 0) {
    throw new Error("expected move prompt after DOUBLE, got " + (state.prompt && state.prompt.type) + " seat " + (state.prompt && state.prompt.seat));
  }
  if (!(state.prompt.options || []).length) throw new Error("move options empty after DOUBLE");
  console.log("double-resumes-move ok");
}

function bootTwo() {
  const rng = () => 0;
  const state = createMatch({
    id: "rules",
    name: "rules",
    rngSeed: rng,
    seats: [
      { seat: 0, playerId: "h0", name: "Dragon", isAI: false },
      { seat: 1, playerId: "ai-1", name: "Bob", isAI: true },
    ],
  });
  applyAction(state, "h0", { type: "pickCharacter", characterId: "cleric" });
  let guard = 0;
  while (state.phase !== "play" && guard++ < 20) {
    tick(state, Date.now() + 100000);
    maybeAct(state);
  }
  flushHolds(state);
  return state;
}

function testDragonCarry() {
  const state = bootTwo();
  const p = state.players[0];
  p.hand = [
    { uid: state.nextUid++, defId: "gold1" },
    { uid: state.nextUid++, defId: "gold1" },
    { uid: state.nextUid++, defId: "gold1" },
    { uid: state.nextUid++, defId: "gold1" },
  ];
  state.combatResult = {
    win: true,
    dragon: true,
    seat: p.seat,
    loot: [{ uid: state.nextUid++, defId: "gold2" }],
  };
  state.prompt = { type: "combatResult", seat: p.seat };
  applyAction(state, "h0", { type: "continue" });
  if (p.status !== "escaped") throw new Error("expected escaped after dragon");
  if (p.hand.length <= 4) throw new Error("expected extra loot after dragon, got " + p.hand.length);
  if (state.prompt?.type !== "overCarry") throw new Error("expected overCarry after dragon loot, got " + (state.prompt && state.prompt.type));
  if (state.phase === "end") throw new Error("game ended before sack dump");
  let dumps = 0;
  while (state.prompt?.type === "overCarry" && dumps++ < 12) {
    const dump = legalActions(state, p.id).find((a) => a.type === "overCarry");
    if (!dump) throw new Error("no dump action while overCarry");
    applyAction(state, p.id, dump);
  }
  if (p.hand.length > 4) throw new Error("still over Strength after dumps: " + p.hand.length);
  console.log("dragon-carry ok");
}

function testLastHpSpend() {
  const state = bootTwo();
  const p = state.players[0];
  p.hp = 1;
  state.turnSeat = p.seat;
  state.turn = { combat: { use: "might", roll: 1, denizenId: "goblin", auto: null, hpBoost: 0 }, phase: "combat" };
  state.prompt = { type: "combatBoost", seat: p.seat, hp: 1, need: 2 };
  if (legalActions(state, p.id).some((a) => a.type === "spendCombatHp")) {
    throw new Error("last HP spend was offered");
  }
  const res = applyAction(state, p.id, { type: "spendCombatHp", n: 1 });
  if (res.ok) throw new Error("spent last HP");
  if (p.hp !== 1) throw new Error("HP changed after rejected spend");
  console.log("last-hp-spend ok");
}

function testOutOfDen() {
  const state = bootTwo();
  const p = state.players[0];
  const other = state.players[1];
  other.status = "escaped";
  other.hand = [{ uid: state.nextUid++, defId: "gold1" }];
  p.hand = [{ uid: state.nextUid++, defId: "yoink" }];
  state.turnSeat = p.seat;
  state.turn = { phase: "preMove", haste: 0 };
  state.prompt = { type: "preMove", seat: p.seat };
  const yoink = applyAction(state, p.id, { type: "playScroll", uid: p.hand[0].uid, defId: "yoink", targetSeat: other.seat });
  if (yoink.ok) throw new Error("yoinked an escaped player");
  if (!other.hand.length) throw new Error("escaped player's loot was taken");

  other.status = "dead";
  state.reaction = { type: "double", clicks: {}, startedAt: Date.now(), spot: { x: 50, y: 50 } };
  if (legalActions(state, other.id).some((a) => a.react === "double")) {
    throw new Error("dead player can click DOUBLE");
  }
  const click = applyAction(state, other.id, { type: "react", react: "double" });
  if (click.ok) throw new Error("dead player recorded a DOUBLE click");
  console.log("out-of-den ok");
}

function testBarryIgnore() {
  const state = bootTwo();
  const p = state.players[0];
  p.characterId = "barbarian";
  p.hp = 7;
  p.maxHp = 7;
  p.barbIgnoreRound = -1;
  state.round = 1;
  state.combatResult = { win: false, seat: p.seat, denizen: { name: "Goblin" } };
  state.prompt = { type: "combatResult", seat: p.seat, win: false, wound: true };
  applyAction(state, "h0", { type: "continue" });
  if (p.hp !== 7) throw new Error("Barry took a hit he should ignore, HP " + p.hp);
  if (p.barbIgnoreRound !== 1) throw new Error("Barry ignore was not consumed");
  state.combatResult = { win: false, seat: p.seat, denizen: { name: "Goblin" } };
  state.prompt = { type: "combatResult", seat: p.seat };
  applyAction(state, "h0", { type: "continue" });
  if (p.hp !== 6) throw new Error("Barry did not take the second hit, HP " + p.hp);
  console.log("barry-ignore ok");
}

function testAutoWinAddsOne() {
  const state = bootTwo();
  const p = state.players[0];
  const loc = p.loc;
  if (state.board[loc]) state.board[loc].revealed = false;
  state.turnSeat = p.seat;
  state.turn = { combat: { use: "might", denizenId: "hamster", auto: null, hpBoost: 0 }, phase: "combat" };
  state.prompt = { type: "combat", seat: p.seat };
  const auto = legalActions(state, p.id).find((a) => a.type === "resolveCombat" && a.auto === "win");
  if (!auto) throw new Error("expected auto-win vs hamster");
  applyAction(state, p.id, auto);
  if (state.prompt?.type !== "combatPause") throw new Error("expected combatPause, got " + (state.prompt && state.prompt.type));
  if (state.prompt.roll !== 1) throw new Error("auto-win should add 1, roll=" + state.prompt.roll);
  if (state.prompt.playerTotal !== state.prompt.playerCs + 1) {
    throw new Error("auto-win total " + state.prompt.playerTotal + " != pcs+1 " + state.prompt.playerCs);
  }
  if (!state.prompt.win) throw new Error("auto-win should win");
  console.log("auto-win-plus-one ok");
}

function testAutoLoseOnTieSix() {
  const state = bootTwo();
  const p = state.players[0];
  p.characterId = "rogue";
  const loc = p.loc;
  if (state.board[loc]) state.board[loc].revealed = false;
  state.turnSeat = p.seat;
  state.turn = { combat: { use: "might", denizenId: "pit_lord", auto: null, hpBoost: 0 }, phase: "combat" };
  state.prompt = { type: "combat", seat: p.seat };
  const auto = legalActions(state, p.id).find((a) => a.type === "resolveCombat" && a.auto === "lose");
  if (!auto) throw new Error("expected auto-lose when a 6 would tie");
  console.log("auto-lose-tie-six ok");
}

function testBoostSpendEnough() {
  const state = bootTwo();
  const p = state.players[0];
  p.hp = 5;
  state.turnSeat = p.seat;
  state.turn = { combat: { use: "might", roll: 1, denizenId: "goblin", auto: null, hpBoost: 0 }, phase: "combat" };
  state.prompt = { type: "combatBoost", seat: p.seat, hp: 5, need: 3 };
  const spends = legalActions(state, p.id).filter((a) => a.type === "spendCombatHp");
  if (spends.some((a) => a.n === 1)) throw new Error("partial HP spend offered");
  if (!spends.some((a) => a.n === 3)) throw new Error("win spend not offered");
  console.log("boost-spend-enough ok");
}

function testAiOverCarry() {
  const state = bootTwo();
  const ai = state.players.find((p) => p.isAI);
  if (!ai || !ai.characterId) throw new Error("AI never picked a class");
  const cap = (CHARACTERS.find((c) => c.id === ai.characterId) || {}).strength || 3;
  ai.hand = [{ uid: state.nextUid++, defId: "yoink" }];
  while (ai.hand.length < cap + 3) ai.hand.push({ uid: state.nextUid++, defId: "music_box" });
  const human = state.players.find((p) => !p.isAI);
  human.status = "escaped";
  human.hand = [];
  state.prompt = { type: "overCarry", seat: ai.seat, cap, text: "Sack full" };
  state.turnSeat = ai.seat;
  state.turn = { phase: "preMove", haste: 0 };
  let n = 0;
  while (state.prompt?.type === "overCarry" && n++ < 20) {
    const res = maybeAct(state);
    if (!res || !res.ok) throw new Error("AI stuck on overCarry: " + (res && res.error) + " got " + (state.prompt && state.prompt.type));
  }
  if (state.prompt?.type === "overCarry") throw new Error("AI never finished dumping");
  if (ai.hand.length > cap) throw new Error("AI still over Strength: " + ai.hand.length + "/" + cap);
  console.log("ai-overcarry ok");
}

assertBoard();
testCatAfterSpace();
testDoubleResumesMove();
testDragonCarry();
testLastHpSpend();
testBarryIgnore();
testAutoWinAddsOne();
testAutoLoseOnTieSix();
testBoostSpendEnough();
testOutOfDen();
testAiOverCarry();
play();
