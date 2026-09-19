const { legalActions, applyAction } = require("./engine/game");
const { lootDef, isTreasure, roomDef } = require("./engine/cards");
const { getCharacter } = require("./engine/characters");
const { BOARD, getSpace, shortestCatPath } = require("./engine/board");

function distTo(from, to) {
  if (from === to) return 0;
  const q = [[from, 0]];
  const seen = new Set([from]);
  while (q.length) {
    const [id, d] = q.shift();
    for (const n of getSpace(id)?.next || []) {
      if (seen.has(n)) continue;
      if (n === to) return d + 1;
      seen.add(n);
      q.push([n, d + 1]);
    }
  }
  return 99;
}

function handValue(p) {
  return (p.hand || []).reduce((s, c) => s + (lootDef(c.defId)?.value || 0), 0);
}

function lookaheadRoom(state, p, dest) {
  let cur = dest;
  for (let i = 0; i < 8; i++) {
    const sp = getSpace(cur);
    if (!sp) return 0;
    if (sp.type === "room" || sp.type === "dragon") return expectedRoomScore(state, p, cur) + (sp.type === "dragon" ? -30 : 0);
    const nxt = sp.next || [];
    if (!nxt.length) return 0;
    cur = nxt[0];
  }
  return 0;
}

function expectedRoomScore(state, p, loc) {
  const cell = state.board[loc];
  if (!cell) return 0;
  const ch = getCharacter(p.characterId);
  const power = Math.max(ch.might, ch.guile);
  const red = cell.red || 0;
  const yellow = cell.yellow || 0;
  const fightRisk = red * (power >= 4 ? 0.25 : power >= 3 ? 0.45 : 0.7);
  return yellow * 180 - fightRisk * 220;
}

function catDanger(state, loc) {
  let d = 0;
  for (const c of state.cats) {
    const path = shortestCatPath(c.loc, loc);
    const dist = path ? path.length - 1 : 9;
    if (dist === 0) d += 80;
    else if (dist <= 2) d += 25;
    else if (dist <= 4) d += 8;
  }
  return d;
}

function pickScrollExtra(state, actor, defId) {
  const others = state.players.filter((x) => x.status === "active" && x.seat !== actor.seat);
  const withLoot = others.filter((o) => (o.hand || []).length).slice().sort((a, b) => handValue(b) - handValue(a));
  const leader = withLoot[0] || others.slice().sort((a, b) => handValue(b) - handValue(a))[0];
  const hurtSelf = actor.hp < actor.maxHp;
  const rooms = Object.keys(state.board);
  switch (defId) {
    case "munchies":
    case "nectar": {
      const wounded = [actor, ...others].filter((p) => p.hp < p.maxHp).sort((a, b) => (a.maxHp - a.hp) - (b.maxHp - b.hp));
      const best = wounded[wounded.length - 1];
      return { targetSeat: (hurtSelf ? actor : best || actor).seat };
    }
    case "yoink":
    case "trashing":
    case "impede":
    case "everyone":
      return leader ? { targetSeat: leader.seat } : {};
    case "over_there":
      return leader ? { targetSeat: leader.seat } : { targetSeat: actor.seat };
    case "empty": {
      const withY = rooms.filter((id) => state.board[id] && getSpace(id)?.type === "room" && state.board[id].yellow > 0 && distTo(actor.loc, id) > 6);
      const anyRoom = rooms.find((id) => getSpace(id)?.type === "room");
      return { roomId: withY[0] || anyRoom || rooms[0] };
    }
    case "missed": {
      const onPath = rooms.find((id) => getSpace(id)?.type === "room" && distTo(actor.loc, id) < 8);
      const anyRoom = rooms.find((id) => getSpace(id)?.type === "room");
      return { roomId: onPath || anyRoom || rooms[0] };
    }
    case "destrong":
    case "desmart":
      return { targetSeat: "denizen" };
    case "enstrong":
    case "ensmart":
      return { targetSeat: actor.seat };
    default:
      return {};
  }
}

function scoreAction(state, actor, a) {
  const ch = getCharacter(actor.characterId);
  let s = 0;
  switch (a.type) {
    case "claimPetCat":
      return 1;
    case "pickCharacter": {
      const c = getCharacter(a.characterId);
      return c.health * 2 + Math.max(c.might, c.guile) * 3 + (c.ability ? 4 : 0);
    }
    case "rollMove":
      return 5;
    case "move": {
      const dest = a.spaceId;
      s += expectedRoomScore(state, actor, dest);
      s += lookaheadRoom(state, actor, dest);
      s -= catDanger(state, dest);
      const remainingLoot = Object.values(state.board).reduce((n, c) => n + (c.yellow || 0), 0);
      const ready = remainingLoot === 0 || state.round >= 8 || Math.min(ch.might, ch.guile) >= 5;
      s -= distTo(dest, BOARD.dragonId) * (ready ? 2.2 : -0.2);
      if (getSpace(dest)?.type === "dragon") {
        if (!ready || actor.hp <= 2) s -= 500;
        else s += 40;
      }
      if (getSpace(dest)?.type === "room") s += 8;
      return s;
    }
    case "catPick": {
      const cat = state.cats.find((c) => c.id === a.catId);
      const victims = state.players.filter((o) => o.status === "active" && o.seat !== actor.seat);
      let best = 0;
      for (const v of victims) {
        const path = shortestCatPath(cat.loc, v.loc);
        const d = path ? path.length - 1 : 20;
        best = Math.max(best, 30 - d * 4 + (handValue(v) > 0 ? 10 : 0));
      }
      return best;
    }
    case "catMove":
    case "doubleCat":
    case "kittyMove": {
      if (a.stop) return 2;
      const catId = state.prompt.catId || state.turn.catId;
      const cat = state.cats.find((c) => c.id === catId);
      const dest = a.spaceId;
      const others = state.players.filter((o) => o.status === "active" && o.seat !== actor.seat);
      let best = 0;
      for (const o of others) {
        const now = shortestCatPath(cat.loc, o.loc)?.length || 20;
        const then = shortestCatPath(dest, o.loc)?.length || 20;
        best = Math.max(best, (now - then) * 8 + (dest === o.loc ? 40 : 0));
      }
      const selfNow = shortestCatPath(dest, actor.loc)?.length || 20;
      if (selfNow === 1) best -= 15;
      if (dest === actor.loc) best -= 50;
      return best;
    }
    case "chooseStat": {
      return a.stat === "might" ? ch.might : ch.guile;
    }
    case "resolveCombat":
      if (a.auto === "win") return 40;
      if (a.auto === "lose") return 1;
      return 14;
    case "resolveDragon":
      return 14;
    case "spendCombatHp": {
      const need = state.prompt?.need || 1;
      if (a.n >= need && actor.hp - a.n >= 1) return 32;
      return 2;
    }
    case "continue":
      return state.prompt?.type === "combatBoost" ? 16 : 1;
    case "sacrificeLoot": {
      const card = actor.hand.find((c) => c.uid === a.uid);
      const val = lootDef(card?.defId)?.value || 0;
      if (state.prompt?.outlook === "win") return 0;
      if (state.prompt?.outlook === "lose") return 26 - val / 200;
      return 9 - val / 400;
    }
    case "playScroll": {
      const others = state.players.filter((x) => x.status === "active" && x.seat !== actor.seat);
      const lootOthers = others.filter((o) => (o.hand || []).length);
      const missing = actor.maxHp - actor.hp;
      const outlook = state.prompt?.outlook || null;
      const over = state.prompt?.type === "overCarry";
      let sc = 22;
      switch (a.defId) {
        case "haste":
          sc = distTo(actor.loc, BOARD.dragonId) <= 10 ? 26 : 18;
          break;
        case "munchies":
          sc = missing >= 2 ? 34 : missing ? 16 : 6;
          break;
        case "nectar":
          sc = missing >= 3 ? 38 : missing ? 18 : 6;
          break;
        case "yoink":
          sc = lootOthers.length ? 42 : -15;
          break;
        case "trashing":
        case "scrapping":
          sc = lootOthers.length ? 40 : -15;
          break;
        case "everyone":
          sc = others.length ? 36 : -10;
          break;
        case "over_there":
          sc = others.length ? 32 : 8;
          break;
        case "who_wants":
        case "in_the_cup":
          sc = lootOthers.length ? 33 : 8;
          break;
        case "war":
        case "peace":
        case "redistribute": {
          const mine = handValue(actor);
          const best = Math.max(0, ...others.map(handValue));
          sc = best > mine + 80 ? 34 : 20;
          break;
        }
        case "impede":
          sc = 28;
          break;
        case "kitty":
          sc = 30;
          break;
        case "fog":
          sc = outlook === "lose" ? 44 : outlook === "win" ? 3 : 24;
          break;
        case "enstrong":
        case "ensmart":
          sc = outlook === "lose" ? 46 : outlook === "win" ? 4 : 36;
          break;
        case "destrong":
        case "desmart":
          sc = outlook === "lose" ? 44 : outlook === "win" ? 5 : 34;
          break;
        case "missed":
          sc = 24;
          break;
        case "empty":
          sc = 14;
          break;
        default:
          sc = 20;
      }
      if (over) sc += 8;
      if ((state.prompt?.type === "combat" || state.prompt?.type === "dragon") && lootDef(a.defId)?.timing === "turn" && !["munchies", "nectar", "fog"].includes(a.defId)) {
        sc -= 12;
      }
      return sc;
    }
    case "discardEnc":
    case "overCarry":
    case "discardItem":
    case "passTreasure": {
      const card = actor.hand.find((c) => c.uid === a.uid);
      if (!card) return 0;
      const d = lootDef(card.defId);
      if (!d) return 0;
      return 10 - (d.value || 0) / 200 - (d.kind === "scroll" ? 6 : 0);
    }
    case "yoinkPick":
      return 10;
    case "react":
      if (a.react === "double") return 12;
      if (a.react === "cup") return 1;
      if (a.react === "who") {
        const t = state.players.find((p) => p.seat === a.targetSeat);
        return t ? handValue(t) / 50 : 0;
      }
      if (a.react === "fork") return 15;
      if (a.react === "declineFork") return 1;
      return 1;
    default:
      return 1;
  }
}

function cheapestDump(state, actor) {
  const dumps = legalActions(state, actor.id).filter((a) => a.type === "overCarry" || a.type === "discardEnc" || a.type === "discardItem");
  if (!dumps.length) return null;
  dumps.sort((a, b) => {
    const da = lootDef(actor.hand.find((c) => c.uid === a.uid)?.defId);
    const db = lootDef(actor.hand.find((c) => c.uid === b.uid)?.defId);
    const va = (da?.value || 0) - (da?.kind === "scroll" ? 80 : 0);
    const vb = (db?.value || 0) - (db?.kind === "scroll" ? 80 : 0);
    return va - vb;
  });
  return dumps[0];
}

function fillScrollTargets(state, actor, action) {
  if (action.type !== "playScroll") return action;
  const extra = pickScrollExtra(state, actor, action.defId);
  return { ...action, ...extra };
}

function actionSig(a) {
  return [a.type, a.uid || "", a.defId || "", a.auto || "", a.stat || "", a.spaceId || "", a.catId || "", a.targetSeat ?? "", a.react || "", a.n || ""].join(":");
}

function chooseAction(state, actorId, skip = new Set()) {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return null;
  let acts = legalActions(state, actorId).map((a) => fillScrollTargets(state, actor, a));
  acts = acts.filter((a) => !skip.has(actionSig(a)));
  if (!acts.length) return null;
  let best = acts[0];
  let bestS = -Infinity;
  for (const a of acts) {
    const sc = scoreAction(state, actor, a) + Math.random() * 0.4;
    if (sc > bestS) {
      bestS = sc;
      best = a;
    }
  }
  return best;
}

function maybeAct(state, apply = applyAction) {
  if (state.phase === "end") return null;
  if (state.reaction) {
    const r = state.reaction;
    if (r.type === "double" || r.type === "cup") {
      const started = r.startedAt || Date.now();
      const elapsed = Date.now() - started;
      const ais = state.players.filter((p) => p.isAI && p.status === "active");
      for (const actor of ais) {
        if (r.clicks && r.clicks[actor.seat] != null) continue;
        const due = (r.aiDue && r.aiDue[actor.seat]) != null ? r.aiDue[actor.seat] : 500 + Math.random() * 2500;
        if (elapsed >= due) {
          return apply(state, actor.id, { type: "react", react: r.type });
        }
      }
      return null;
    }
    if (r.type === "who") {
      const ais = state.players.filter((p) => p.isAI && p.status === "active");
      const actor = ais[0];
      if (!actor) return null;
      const a = chooseAction(state, actor.id);
      if (a) return apply(state, actor.id, a);
    }
    if (r.type === "fork") {
      const t = state.players.find((p) => p.seat === r.targetSeat && p.isAI);
      if (t) {
        const a = chooseAction(state, t.id);
        if (a) return apply(state, t.id, a);
      }
    }
    return null;
  }
  const pr = state.prompt;
  if (!pr) return null;
  if (pr.type === "petCat") return null;
  if (pr.type === "roomReveal" || pr.type === "denizenReveal" || pr.type === "combatResult" || pr.type === "lootResult" || pr.type === "raceResult" || pr.type === "walkWait" || pr.type === "catAnnounce" || pr.type === "fightAnnounce" || pr.type === "turnAnnounce" || pr.type === "deathAnnounce") return null;
  if (pr.seat == null) return null;
  const actor = state.players.find((p) => p.seat === pr.seat);
  if (!actor?.isAI) return null;
  if (pr.type === "overCarry" || pr.type === "discardEnc" || pr.type === "discardItem") {
    const a = chooseAction(state, actor.id);
    if (a?.type === "playScroll") {
      const res = apply(state, actor.id, a);
      if (res?.ok) return res;
    }
    const dump = cheapestDump(state, actor);
    if (dump) return apply(state, actor.id, dump);
  }
  const skip = new Set();
  for (let i = 0; i < 12; i++) {
    const a = chooseAction(state, actor.id, skip);
    if (!a) return null;
    const res = apply(state, actor.id, a);
    if (res?.ok) return res;
    skip.add(actionSig(a));
  }
  if (pr.type === "preMove") return apply(state, actor.id, { type: "rollMove" });
  if (pr.type === "overCarry" || pr.type === "discardEnc" || pr.type === "discardItem") {
    const dump = cheapestDump(state, actor);
    if (dump) return apply(state, actor.id, dump);
  }
  return null;
}

module.exports = { chooseAction, maybeAct, fillScrollTargets };
