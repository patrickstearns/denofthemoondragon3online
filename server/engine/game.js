const { CHARACTERS, getCharacter } = require("./characters");
const {
  ROOM_CARDS,
  DENIZEN_CARDS,
  LOOT_CARDS,
  lootDef,
  roomDef,
  denizenDef,
  isTreasure,
  isScroll,
} = require("./cards");
const { BOARD, getSpace, playerNeighbors, catNeighbors } = require("./board");

const REACTION_MS = 5000;
const CUP_MS = 8000;
const PET_MS = 20000;
const DICE_MS = 1400;
const REVEAL_MS = 2800;
const DENIZEN_REVEAL_MS = 1100;
const COMBAT_PAUSE_MS = 1800;
const COMBAT_RESULT_MS = 8000;
const COMBAT_LOOT_MS = 10400;
const COMBAT_WOUND_MS = 4000;
const RACE_RESULT_MS = 8000;
const CAT_BANNER_MS = 1600;
const FIGHT_BANNER_MS = 1100;
const TURN_BANNER_MS = 1700;
const DEATH_BANNER_MS = 1800;
const WALK_HOP_MS = 260;

function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(rng, arr) {
  if (!arr.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function encOf(hand) {
  return hand.reduce((s, c) => s + (lootDef(c.defId)?.enc || 0), 0);
}

function strengthOf(p) {
  return getCharacter(p.characterId)?.strength ?? 0;
}

function publicLoot(card) {
  return { uid: card.uid, defId: card.defId, ...lootDef(card.defId) };
}

function enqueueNotice(state, notice) {
  if (!notice || !(notice.cards || []).length) return;
  state.noticeQueue = state.noticeQueue || [];
  state.noticeQueue.push(notice);
}

function noticesBusy(state) {
  const t = state.prompt?.type;
  return !!(
    state.reaction ||
    [
      "lootResult", "combatResult", "raceResult", "discardItem",
      "yoinkPick", "passTreasure", "roomReveal", "denizenReveal", "deathAnnounce",
      "combatPause", "diceWait", "walkWait", "chooseStat",
    ].includes(t)
  );
}

function flushNotices(state) {
  if (noticesBusy(state)) return false;
  const q = state.noticeQueue;
  if (!q || !q.length) return false;
  const n = q.shift();
  const p = playerBySeat(state, n.seat);
  const cards = n.cards || [];
  if (!cards.length) return flushNotices(state);
  state.lootResult = {
    seat: n.seat,
    loot: n.addToHand ? cards : [],
    endsAt: Date.now() + dialogMs(COMBAT_LOOT_MS, p),
    after: n.after || null,
    notice: true,
  };
  setPrompt(state, {
    type: "lootResult",
    seat: n.seat,
    title: n.title || (n.kind === "loss" ? "Discarded!" : "Loot!"),
    text: n.text || "",
    kind: n.kind || (n.addToHand ? "gain" : "loss"),
    loot: cards.map(publicLoot),
  });
  return true;
}

function discardNow(state, t, card, why) {
  if (!t || !card) return;
  const held = takeCard(t.hand, card.uid) || card;
  state.treasurePile.push(held);
  const name = lootDef(held.defId)?.name || "a card";
  log(state, `${t.name} discards ${name}.`, t.seat);
  enqueueNotice(state, {
    seat: t.seat,
    kind: "loss",
    title: "Discarded!",
    text: why || `${t.name} discards ${name}.`,
    cards: [held],
  });
}

function valueOf(hand) {
  return hand.reduce((s, c) => s + (lootDef(c.defId)?.value || 0), 0);
}

function activePlayers(state) {
  return state.players.filter((p) => p.status === "active");
}

function clockwiseFrom(state, seat) {
  const seats = state.players.map((p) => p.seat).sort((a, b) => a - b);
  const i = seats.indexOf(seat);
  for (let k = 1; k <= seats.length; k++) {
    const s = seats[(i + k) % seats.length];
    const p = playerBySeat(state, s);
    if (p && p.status === "active") return p;
  }
  return null;
}

function playerBySeat(state, seat) {
  return state.players.find((p) => p.seat === seat) || null;
}

function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

function log(state, text, seat = null) {
  state.log.push({ n: state.log.length, text, seat, at: Date.now() });
  if (state.log.length > 100) state.log.splice(0, state.log.length - 100);
}

function drawLoot(state, n = 1) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (!state.decks.loot.length) {
      if (!state.decks.lootDiscard.length) break;
      state.decks.loot = shuffle(state.rng, state.decks.lootDiscard);
      state.decks.lootDiscard = [];
    }
    const defId = state.decks.loot.shift();
    got.push({ uid: state.nextUid++, defId });
  }
  return got;
}

function drawDenizen(state) {
  if (!state.decks.denizens.length) {
    if (!state.decks.denizenDiscard.length) return null;
    state.decks.denizens = shuffle(state.rng, state.decks.denizenDiscard);
    state.decks.denizenDiscard = [];
  }
  return state.decks.denizens.shift();
}

function discardDenizen(state, id) {
  if (id && id !== "dragon") state.decks.denizenDiscard.push(id);
}

function takeCard(hand, uid) {
  const i = hand.findIndex((c) => c.uid === uid);
  if (i < 0) return null;
  return hand.splice(i, 1)[0];
}

function treasures(hand) {
  return hand.filter((c) => isTreasure(c.defId));
}

function scrolls(hand) {
  return hand.filter((c) => isScroll(c.defId));
}

function catByRole(state, role) {
  return state.cats.find((c) => c.role === role);
}

function catsOn(state, loc) {
  return state.cats.filter((c) => c.loc === loc);
}

function playersOn(state, loc) {
  return state.players.filter((p) => p.status === "active" && p.loc === loc);
}

function mightOf(state, p) {
  const ch = getCharacter(p.characterId);
  let m = ch.might;
  const mods = state.combatMods[p.seat] || {};
  if (mods.mightSet != null) m = mods.mightSet;
  m += mods.mightAdd || 0;
  return m;
}

function guileOf(state, p) {
  const ch = getCharacter(p.characterId);
  let g = ch.guile;
  const mods = state.combatMods[p.seat] || {};
  if (mods.guileSet != null) g = mods.guileSet;
  g += mods.guileAdd || 0;
  return g;
}

function rawMight(state, p) {
  const ch = getCharacter(p.characterId);
  const mods = state.combatMods[p.seat] || {};
  return mods.mightSet != null ? mods.mightSet : ch.might;
}

function rawGuile(state, p) {
  const ch = getCharacter(p.characterId);
  const mods = state.combatMods[p.seat] || {};
  return mods.guileSet != null ? mods.guileSet : ch.guile;
}

function roomCs(state, loc) {
  const sp = state.board[loc];
  if (!sp || !sp.revealed || !sp.roomCard) return 0;
  return roomDef(sp.roomCard)?.cs || 0;
}

function combatParts(state, p, use) {
  const mods = state.combatMods[p.seat] || {};
  let stat;
  let statLabel;
  if (use === "might") {
    stat = mightOf(state, p);
    statLabel = "Might";
  } else if (use === "guile") {
    stat = guileOf(state, p);
    statLabel = "Guile";
  } else {
    const rm = rawMight(state, p);
    const rg = rawGuile(state, p);
    stat = Math.min(rm, rg) + (mods.mightAdd || 0) + (mods.guileAdd || 0);
    statLabel = rm <= rg ? "Might" : "Guile";
  }
  const room = roomCs(state, p.loc);
  const extra = (mods.csAdd || 0) + ((state.turn && state.turn.combat && state.turn.combat.hpBoost) || 0);
  return {
    stat,
    statLabel,
    room,
    extra,
    total: stat + room + extra,
  };
}

function combatScore(state, p, use) {
  return combatParts(state, p, use).total;
}

function scoreFields(state, p, use) {
  const parts = combatParts(state, p, use);
  return {
    playerCs: parts.total,
    playerStat: parts.stat,
    playerStatLabel: parts.statLabel,
    roomCs: parts.room,
  };
}

function denizenScore(def, use, state) {
  const mods = (state && state.combatMods && state.combatMods.denizen) || {};
  let might = def.might ?? 0;
  let guile = def.guile ?? 0;
  if (mods.mightSet != null) might = mods.mightSet;
  might += mods.mightAdd || 0;
  if (mods.guileSet != null) guile = mods.guileSet;
  guile += mods.guileAdd || 0;
  if (use === "might") return might;
  if (use === "guile") return guile;
  return Math.min(might, guile);
}

const DRAGON = {
  id: "dragon",
  name: "The Dragon",
  might: 8,
  guile: 8,
  use: "lower",
  flavor: "Might 8 / Guile 8. You must use the lower of Might or Guile.",
};

function isDragonCombat(state) {
  return !!(state.turn?.combat && (state.turn.combat.dragon || state.turn.combat.denizenId === "dragon"));
}

function combatFoe(state) {
  if (!state.turn?.combat) return null;
  if (isDragonCombat(state)) {
    const pen = state.dragonPenalty || 0;
    const n = Math.max(0, 8 - pen);
    return {
      ...DRAGON,
      might: n,
      guile: n,
      flavor: pen
        ? `Might ${n} / Guile ${n}. Sacrifices have lowered the Dragon by ${pen}. Sacrifice more loot to lower it further.`
        : "Might 8 / Guile 8. You must use the lower of Might or Guile. Sacrifice loot to permanently lower the Dragon's score by 1.",
    };
  }
  return denizenDef(state.turn.combat.denizenId);
}

function combatOutlook(state, p) {
  if (!state.turn?.combat || !p) return null;
  const def = combatFoe(state);
  if (!def) return null;
  const use = combatUseOf(state.turn.combat);
  const pcs = combatScore(state, p, use);
  const dcs = denizenScore(def, use, state);
  if (pcs >= dcs) return "win";
  if (dcs - pcs >= 6) return "lose";
  return null;
}

function combatDieAdd(combat) {
  if (!combat) return 0;
  if (combat.auto === "win") return 1;
  if (combat.auto === "lose") return 0;
  return combat.roll || 0;
}

function willIgnoreHit(state, p) {
  if (!p || p.status !== "active") return false;
  const ch = getCharacter(p.characterId);
  return !!(ch && ch.ability === "barbarian_ignore" && p.barbIgnoreRound !== state.round);
}

function hurt(state, p, amount, reason) {
  if (p.status !== "active" || amount <= 0) return 0;
  if (willIgnoreHit(state, p)) {
    p.barbIgnoreRound = state.round;
    log(state, `${p.name} (Barry) ignores the first hit.`, p.seat);
    amount -= 1;
    if (amount <= 0) return 0;
  }
  p.hp -= amount;
  log(state, `${p.name} loses ${amount} HP (${reason}). HP ${Math.max(p.hp, 0)}/${p.maxHp}.`, p.seat);
  if (p.hp <= 0) {
    p.hp = 0;
    eliminate(state, p, reason);
  }
  return amount;
}

function eliminate(state, p, reason) {
  if (p.status !== "active") return;
  p.status = "dead";
  p.hp = 0;
  for (const c of p.hand.splice(0)) state.treasurePile.push(c);
  log(state, `${p.name} is out of the game (${reason}).`, p.seat);
  const resume = state._afterDeath;
  state._afterDeath = null;
  state.deathAnnounce = {
    seat: p.seat,
    name: p.name,
    endsAt: Date.now() + DEATH_BANNER_MS,
    resume,
  };
  setPrompt(state, {
    type: "deathAnnounce",
    seat: p.seat,
    text: `${p.name} has died.`,
  });
}

function finishDeathAnnounce(state) {
  const info = state.deathAnnounce;
  state.deathAnnounce = null;
  checkEnd(state);
  if (state.phase === "end") {
    state.prompt = null;
    return;
  }
  if (typeof info?.resume === "function") {
    info.resume();
    return;
  }
  const actor = playerBySeat(state, state.turnSeat);
  if (actor && actor.status === "active") afterSpaceResolved(state, actor);
  else nextTurn(state);
}

function escapeDrawCount(state) {
  const n = (state.escapeCount || 0) + 1;
  return n === 1 ? 2 : n === 2 ? 1 : 0;
}

function escapePlayer(state, p, opts = {}) {
  if (p.status !== "active") return;
  p.status = "escaped";
  state.escapeCount += 1;
  p.escapeOrder = state.escapeCount;
  if (opts.skipDraw) {
    log(state, `${p.name} escapes the Den!`, p.seat);
    return;
  }
  const draws = state.escapeCount === 1 ? 2 : state.escapeCount === 2 ? 1 : 0;
  if (draws) {
    const cards = drawLoot(state, draws);
    p.hand.push(...cards);
    log(state, `${p.name} escapes the Den! Draws ${draws} Loot.`, p.seat);
  } else {
    log(state, `${p.name} escapes the Den! No remaining Loot draws.`, p.seat);
  }
}

function checkEnd(state) {
  if (activePlayers(state).length) return;
  if (state.prompt?.type === "overCarry" || state.prompt?.type === "lootResult") return;
  state.phase = "end";
  state.reaction = null;
  if (state.prompt?.type !== "deathAnnounce") state.prompt = null;
  const escaped = state.players.filter((x) => x.status === "escaped");
  if (!escaped.length) {
    state.winners = [];
    log(state, "All adventurers died. The dragon keeps the hoard.");
    return;
  }
  escaped.sort((a, b) => {
    const dv = valueOf(b.hand) - valueOf(a.hand);
    if (dv) return dv;
    return (a.escapeOrder || 99) - (b.escapeOrder || 99);
  });
  const best = valueOf(escaped[0].hand);
  state.winners = escaped.filter((x) => valueOf(x.hand) === best).map((x) => x.seat);
  log(state, `Game over. Winner: ${escaped.filter((x) => valueOf(x.hand) === best).map((x) => `${x.name} (${valueOf(x.hand)} gp)`).join(", ")}.`);
}

function catHitsVictim(state, victim, cat) {
  if (!victim || victim.status !== "active") return;
  const ts = treasures(victim.hand);
  state.pendingCatWounds = state.pendingCatWounds || [];
  if (ts.length) {
    const card = pick(state.rng, ts);
    state.pendingCatWounds.push({ kind: "dump", seat: victim.seat, catName: cat.name, card });
    return;
  }
  state.pendingCatWounds.push({ kind: "wound", seat: victim.seat, catName: cat.name });
}

function showPendingCatWound(state, resume) {
  const q = state.pendingCatWounds;
  if (!q || !q.length) {
    resume();
    return;
  }
  const w = q.shift();
  const victim = playerBySeat(state, w.seat);
  if (!victim || victim.status !== "active") {
    showPendingCatWound(state, resume);
    return;
  }
  const dump = w.kind === "dump" && w.card;
  const card = dump ? w.card : null;
  state.combatResult = {
    win: false,
    catHit: true,
    catWound: !dump,
    catDump: !!dump,
    seat: victim.seat,
    woundSeat: victim.seat,
    catName: w.catName,
    card,
    endsAt: Date.now() + dialogMs(COMBAT_WOUND_MS, victim),
    after: resume,
  };
  setPrompt(state, {
    type: "combatResult",
    seat: victim.seat,
    catHit: true,
    catWound: !dump,
    catDump: !!dump,
    text: dump ? `${victim.name} lost an item!` : "Wounded!",
    win: false,
    wound: !dump,
    woundSeat: victim.seat,
    denizen: { name: w.catName },
    loot: card ? [publicLoot(card)] : [],
  });
}

function moveCatStep(state, cat, dest) {
  if (!catNeighbors(cat.loc).includes(dest)) return false;
  cat.loc = dest;
  const victims = playersOn(state, dest);
  if (victims.length) {
    for (const v of victims) catHitsVictim(state, v, cat);
    return "hit";
  }
  return true;
}

function rollDie(state, reason) {
  const n = 1 + Math.floor(state.rng() * 6);
  log(state, `Rolled ${n} (${reason}).`);
  if (state.diceFx && state.diceFx.open) {
    state.diceFx.faces.push(n);
  } else {
    state.diceSeq = (state.diceSeq || 0) + 1;
    state.diceFx = {
      seq: state.diceSeq,
      faces: [n],
      reason,
      endsAt: Date.now() + DICE_MS,
      open: true,
      after: null,
    };
  }
  if (state.lastDie === n && !doubleBusy(state)) {
    state.pendingDouble = n;
  }
  state.lastDie = n;
  return n;
}

function closeDice(state, after) {
  if (!state.diceFx) return;
  state.diceFx.open = false;
  state.diceFx.after = after;
  state.diceFx.endsAt = Date.now() + DICE_MS;
}

function doubleBusy(state) {
  return !!(
    state._double ||
    (state.reaction && state.reaction.type === "double") ||
    state.prompt?.type === "doubleCat" ||
    (state.prompt?.type === "raceResult" && state.prompt.kind === "double")
  );
}

function finishDice(state) {
  const after = state.diceFx && state.diceFx.after;
  if (state.diceFx) state.diceFx.after = null;
  if (state.pendingDouble != null && after !== "doubleCat") {
    const n = state.pendingDouble;
    state.pendingDouble = null;
    startReaction(state, "double", REACTION_MS, {
      number: n,
      resumeAfter: after,
      text: `${n} twice in a row! Tap DOUBLE! Fastest click moves ${catByRole(state, "C").name}.`,
    });
    return;
  }
  state.pendingDouble = null;
  applyDiceAfter(state, after);
}

function applyDiceAfter(state, after) {
  const p = playerBySeat(state, state.turnSeat);
  if (after === "promptMove" && p) promptMove(state, p);
  else if (after === "catStep" && p) {
    const cat = state.cats.find((c) => c.id === state.turn.catId);
    if (cat) promptCatStep(state, p, cat, false);
    else applyEndOfTurn(state, p);
  } else if (after === "doubleCat") {
    beginDoubleCatPrompt(state);
  } else if (after === "combatSettle" && p) {
    beginCombatPause(state, p);
  } else if (state.turn?.needsMove && p) {
    promptMove(state, p);
  }
}

function beginCatAnnounce(state, seat, cat, kind, extra = {}) {
  const actor = playerBySeat(state, seat);
  if (!cat && kind !== "catPick" && kind !== "kittyPick") {
    if (kind === "doubleCat") beginDoubleCatPrompt(state);
    else if (kind === "kittyMove") restoreOrPreMove(state);
    else applyEndOfTurn(state, actor);
    return;
  }
  state.catAnnounce = {
    seat,
    catId: cat ? cat.id : null,
    kind,
    saved: extra.saved,
    endsAt: Date.now() + CAT_BANNER_MS,
  };
  setPrompt(state, {
    type: "catAnnounce",
    seat,
    catId: cat ? cat.id : null,
    kind,
    text: `${actor ? actor.name : "Someone"} to move a cat!`,
  });
}

function finishCatAnnounce(state) {
  const info = state.catAnnounce;
  state.catAnnounce = null;
  if (!info) return;
  const cat = info.catId ? state.cats.find((c) => c.id === info.catId) : null;
  const p = playerBySeat(state, info.seat);
  if (info.kind === "catPick") {
    if (!p || p.status !== "active") {
      nextTurn(state);
      return;
    }
    const die = state.turn && state.turn.primaryDie;
    setPrompt(state, {
      type: "catPick",
      seat: p.seat,
      text: `Rolled ${die}. Click a highlighted cat to move it.`,
      cats: state.cats.filter((c) => c.role !== "C").map((c) => c.id),
    });
    return;
  }
  if (info.kind === "kittyPick") {
    if (!p) {
      restoreOrPreMove(state);
      return;
    }
    setPrompt(state, {
      type: "kittyPick",
      seat: p.seat,
      text: "Choose a cat to move up to 6 spaces.",
      saved: info.saved,
    });
    return;
  }
  if (info.kind === "doubleCat") {
    if (!cat || !p) {
      beginDoubleCatPrompt(state);
      return;
    }
    const steps = rollDie(state, `${cat.name} (DOUBLE!)`);
    if (state._double) state._double.steps = steps;
    state.turn.catId = cat.id;
    state.turn.catSteps = steps;
    closeDice(state, "doubleCat");
    setPrompt(state, { type: "diceWait", seat: p.seat, text: `${cat.name} (DOUBLE!)...` });
    return;
  }
  if (info.kind === "kittyMove") {
    if (!cat || !p) {
      restoreOrPreMove(state);
      return;
    }
    const left = state.turn._kitty?.left ?? 6;
    setPrompt(state, {
      type: "kittyMove",
      seat: p.seat,
      catId: cat.id,
      text: `Move ${cat.name} up to ${left} spaces (or stop). Click any highlighted space.`,
      options: catDestOptions(state, cat, left),
      canStop: true,
    });
    return;
  }
  if (cat && p) {
    const steps = rollDie(state, `${cat.name} movement`);
    state.turn.catId = cat.id;
    state.turn.catSteps = steps;
    closeDice(state, "catStep");
    setPrompt(state, { type: "diceWait", seat: p.seat, text: `${cat.name} is on the move...` });
  } else applyEndOfTurn(state, p);
}

function beginDoubleCatPrompt(state) {
  const cat = state.cats.find((c) => c.id === ((state._double && state._double.catId) || state.turn.catId));
  const seat = state._double ? state._double.seat : state.turnSeat;
  const opts = cat ? catDestOptions(state, cat, state.turn.catSteps) : [];
  if (!cat || !opts.length) {
    finishDoubleCat(state);
    return;
  }
  setPrompt(state, {
    type: "doubleCat",
    seat,
    catId: cat.id,
    text: `DOUBLE! Move ${cat.name} ${state.turn.catSteps} spaces. Click any highlighted space.`,
    options: opts,
  });
}

function startReaction(state, type, ms, extra = {}) {
  const race = type === "double" || type === "cup";
  const aiDue = {};
  if (race) {
    for (const p of activePlayers(state)) {
      if (p.isAI) aiDue[p.seat] = 500 + Math.floor((state.rng ? state.rng() : Math.random()) * 2501);
    }
  }
  state.reaction = {
    type,
    endsAt: Date.now() + ms,
    lastSeat: extra.lastSeat ?? null,
    claims: extra.claims || [],
    casterSeat: extra.casterSeat ?? null,
    targetSeat: extra.targetSeat ?? null,
    scrollUid: extra.scrollUid ?? null,
    number: extra.number ?? null,
    text: extra.text || "",
    resumeAfter: extra.resumeAfter ?? null,
    original: extra.original || null,
    startedAt: extra.startedAt ?? Date.now(),
    spot: extra.spot || (race ? { x: 14 + (state.rng ? state.rng() : Math.random()) * 72, y: 14 + (state.rng ? state.rng() : Math.random()) * 72 } : null),
    clicks: extra.clicks || {},
    aiDue,
  };
}

function racePlayers(state) {
  return activePlayers(state);
}

function recordRaceClick(state, actor) {
  const r = state.reaction;
  if (!r || (r.type !== "double" && r.type !== "cup")) return { ok: false, error: "No race." };
  if (!actor || actor.status !== "active") return { ok: false, error: "You're out of the den." };
  r.clicks = r.clicks || {};
  if (r.clicks[actor.seat] != null) return { ok: true };
  const t = Math.max(0, Date.now() - (r.startedAt || Date.now()));
  r.clicks[actor.seat] = t;
  log(state, `${actor.name} hits ${r.type === "double" ? "DOUBLE!" : "IN THE CUP"} in ${(t / 1000).toFixed(2)}s.`, actor.seat);
  maybeResolveRace(state);
  return { ok: true };
}

function maybeResolveRace(state) {
  const r = state.reaction;
  if (!r || (r.type !== "double" && r.type !== "cup")) return;
  const all = racePlayers(state);
  if (!all.length) {
    clearReaction(state);
    return;
  }
  if (all.every((p) => r.clicks[p.seat] != null)) resolveRace(state);
}

function raceTime(r, seat) {
  const t = r.clicks && r.clicks[seat];
  return t == null ? Number.POSITIVE_INFINITY : t;
}

function resolveRace(state) {
  const r = state.reaction;
  if (!r) return;
  const all = racePlayers(state);
  let fastest = all[0];
  let slowest = all[0];
  for (const p of all) {
    const t = raceTime(r, p.seat);
    if (t < raceTime(r, fastest.seat)) fastest = p;
    if (t > raceTime(r, slowest.seat)) slowest = p;
  }
  const kind = r.type;
  const resumeAfter = r.resumeAfter || null;
  const times = all.map((p) => ({
    seat: p.seat,
    name: p.name,
    ms: Number.isFinite(raceTime(r, p.seat)) ? raceTime(r, p.seat) : null,
  }));
  let winner = fastest;
  let loser = slowest;
  if (kind === "double") {
    winner = Number.isFinite(raceTime(r, fastest.seat)) ? fastest : pick(state.rng, all);
    if (winner && Number.isFinite(raceTime(r, winner.seat))) {
      log(state, `${winner.name} wins DOUBLE! (${(raceTime(r, winner.seat) / 1000).toFixed(2)}s).`, winner.seat);
    } else if (winner) {
      log(state, `${winner.name} wins DOUBLE!`, winner.seat);
    }
  } else {
    if (slowest) log(state, `${slowest.name} is last in the cup.`, slowest.seat);
    if (fastest && Number.isFinite(raceTime(r, fastest.seat))) {
      log(state, `${fastest.name} wins IN THE CUP (${(raceTime(r, fastest.seat) / 1000).toFixed(2)}s).`, fastest.seat);
    }
  }
  clearReaction(state);
  const keepPrompt = state.prompt && state.prompt.type !== "diceWait" && state.prompt.type !== "raceResult"
    ? clone(state.prompt)
    : null;
  const winnerName = winner ? winner.name : "Someone";
  const loserName = loser ? loser.name : "Someone";
  const text = kind === "double"
    ? `${winnerName} wins DOUBLE!`
    : `${winnerName} wins IN THE CUP! ${loserName} discards an item.`;
  state.raceResult = {
    kind,
    winnerSeat: winner ? winner.seat : null,
    loserSeat: loser ? loser.seat : null,
    resumeAfter,
    savedPrompt: keepPrompt,
    times,
    endsAt: Date.now() + RACE_RESULT_MS,
  };
  setPrompt(state, {
    type: "raceResult",
    seat: null,
    kind,
    winnerSeat: winner ? winner.seat : null,
    loserSeat: loser ? loser.seat : null,
    winnerName,
    loserName,
    times,
    text,
  });
}

function finishRaceResult(state) {
  const info = state.raceResult;
  state.raceResult = null;
  if (!info) {
    restoreOrPreMove(state);
    return;
  }
  if (info.kind === "double") {
    beginDoubleMove(state, info.winnerSeat, info.resumeAfter);
    return;
  }
  const t = playerBySeat(state, info.loserSeat);
  if (t && t.status === "active") forceDiscard(state, t, "Item", `${t.name} was last in the cup and discards an item.`);
  if (flushDiscardQueue(state)) {
    if (info.savedPrompt) state._afterDiscard = info.savedPrompt;
    return;
  }
  if (info.resumeAfter) applyDiceAfter(state, info.resumeAfter);
  else if (info.savedPrompt) setPrompt(state, info.savedPrompt);
  else restoreOrPreMove(state);
}

function beginDoubleMove(state, winnerSeat, resumeAfter) {
  const cat = catByRole(state, "C");
  const p = playerBySeat(state, winnerSeat);
  log(state, `${p ? p.name : "Someone"} calls DOUBLE! ${cat.name} is up.`);
  state.turn = state.turn || {};
  state._double = {
    catId: cat.id,
    steps: 0,
    seat: winnerSeat,
    resumeAfter: resumeAfter || null,
    savedCatId: state.turn.catId,
    savedCatSteps: state.turn.catSteps,
  };
  state.turn.catId = cat.id;
  state.turn.catSteps = 0;
  beginCatAnnounce(state, winnerSeat, cat, "doubleCat");
}

function finishDoubleCat(state) {
  const saved = state._double;
  state._double = null;
  if (saved?.savedCatId != null) state.turn.catId = saved.savedCatId;
  if (saved && Object.prototype.hasOwnProperty.call(saved, "savedCatSteps")) {
    state.turn.catSteps = saved.savedCatSteps;
  }
  const after = saved?.resumeAfter && saved.resumeAfter !== "doubleCat" ? saved.resumeAfter : null;
  if (after) {
    applyDiceAfter(state, after);
    return;
  }
  resumeAfterDouble(state);
}

function resumeAfterDouble(state) {
  const p = playerBySeat(state, state.turnSeat);
  if (!p || p.status !== "active") {
    nextTurn(state);
    return;
  }
  if (state.turn?.needsMove || state.turn?.phase === "move") {
    promptMove(state, p);
    return;
  }
  if (state.turn?.phase === "catMove" && state.turn.catId && state.turn.catSteps > 0) {
    const cat = state.cats.find((c) => c.id === state.turn.catId);
    if (cat) {
      promptCatStep(state, p, cat, false);
      return;
    }
  }
  restoreOrPreMove(state);
}

function clearReaction(state) {
  state.reaction = null;
}

function setPrompt(state, prompt) {
  state.prompt = prompt;
}

function currentActor(state) {
  if (state.reaction) return null;
  return state.prompt?.seat ?? null;
}

function beginTurn(state) {
  if (state.phase !== "play") return;
  const p = playerBySeat(state, state.turnSeat);
  if (!p || p.status !== "active") {
    nextTurn(state);
    return;
  }
  state.combatMods = {};
  state.turn = {
    phase: "preMove",
    moveDice: [],
    stepsLeft: 0,
    haste: 0,
    catId: null,
    catSteps: 0,
    moved: false,
    catsDone: false,
    primaryDie: null,
  };
  state.lastDie = null;
  log(state, `— ${p.name}'s turn —`, p.seat);
  state.turnSeq = (state.turnSeq || 0) + 1;
  beginTurnAnnounce(state, p);
}

function beginTurnAnnounce(state, p) {
  state.turnAnnounce = { seat: p.seat, endsAt: Date.now() + TURN_BANNER_MS };
  setPrompt(state, {
    type: "turnAnnounce",
    seat: p.seat,
    text: `${p.name}'s Turn`,
  });
}

function finishTurnAnnounce(state) {
  const seat = state.turnAnnounce?.seat ?? state.turnSeat;
  state.turnAnnounce = null;
  const p = playerBySeat(state, seat);
  if (!p || p.status !== "active") {
    nextTurn(state);
    return;
  }
  if (p.loc === BOARD.dragonId) {
    state.turn.phase = "dragon";
    offerDragon(state, p);
    return;
  }
  const cell = state.board[p.loc];
  const sp = getSpace(p.loc);
  if (sp?.type === "room" && cell?.revealed && cell.red > 0) {
    state.turn.phase = "room";
    state.turn.stayFight = true;
    log(state, `${p.name} stays to finish the denizens.`, p.seat);
    beginFightAnnounce(state, p);
    return;
  }
  offerPreMove(state, p);
}

function beginFightAnnounce(state, p) {
  state.fightAnnounce = { seat: p.seat, endsAt: Date.now() + FIGHT_BANNER_MS };
  setPrompt(state, {
    type: "fightAnnounce",
    seat: p.seat,
    text: `${p.name} is still fighting!`,
  });
}

function finishFightAnnounce(state) {
  const seat = state.fightAnnounce?.seat ?? state.turnSeat;
  state.fightAnnounce = null;
  const p = playerBySeat(state, seat);
  if (p && p.status === "active") startCombat(state, p);
  else nextTurn(state);
}

function offerPreMove(state, p) {
  setPrompt(state, {
    type: "preMove",
    seat: p.seat,
    text: "Play a scroll or roll movement.",
    canHaste: scrolls(p.hand).some((c) => c.defId === "haste"),
  });
}

function afterMoveResolved(state, p) {
  if (p.status !== "active") {
    nextTurn(state);
    return;
  }
  resolveLanding(state, p);
}

function resolveLanding(state, p) {
  if (p.status !== "active") {
    nextTurn(state);
    return;
  }
  const sp = getSpace(p.loc);
  if (sp?.type === "dragon") {
    state.turn.phase = "dragon";
    offerDragon(state, p);
    return;
  }
  if (sp?.type === "room") {
    state.turn.phase = "room";
    startRoom(state, p);
    return;
  }
  afterSpaceResolved(state, p);
}

function afterSpaceResolved(state, p) {
  const die = state.turn && state.turn.primaryDie;
  if (state.turn && !state.turn.catsDone && (die === 1 || die === 6) && p && p.status === "active") {
    state.turn.catsDone = true;
    state.turn.phase = "catPick";
    beginCatAnnounce(state, p.seat, null, "catPick");
    return;
  }
  applyEndOfTurn(state, p);
}

function applyEndOfTurn(state, p) {
  if (p.status === "active") {
    const cell = state.board[p.loc];
    if (cell?.revealed && roomDef(cell.roomCard)?.fountain) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      log(state, `The Clear Fountain restores 1 HP to ${p.name}.`, p.seat);
    }
  }
  nextTurn(state);
}

function startRoom(state, p) {
  const cell = state.board[p.loc];
  if (!cell.revealed) {
    const def = roomDef(cell.roomCard);
    state.turn.phase = "reveal";
    state.roomReveal = {
      loc: p.loc,
      roomId: cell.roomCard,
      endsAt: Date.now() + REVEAL_MS,
      seat: p.seat,
    };
    setPrompt(state, {
      type: "roomReveal",
      seat: p.seat,
      text: `${p.name} opens a door...`,
      room: { ...def, art: `/assets/rooms/${def.id}.png` },
      loc: p.loc,
    });
    return;
  }
  continueRoom(state, p);
}

function applyRoomReveal(state) {
  const info = state.roomReveal;
  if (!info) return;
  state.roomReveal = null;
  const p = playerBySeat(state, info.seat);
  const cell = state.board[info.loc];
  if (!cell) {
    if (p) continueRoom(state, p);
    return;
  }
  cell.revealed = true;
  const def = roomDef(cell.roomCard);
  log(state, `${p ? p.name : "Someone"} reveals ${def.name}: ${def.text}`, p ? p.seat : null);
  if (def.reveal?.zen) {
    cell.red = 0;
    cell.yellow = 0;
  }
  if (def.reveal?.denizen) cell.red += def.reveal.denizen;
  if (def.reveal?.loot) cell.yellow += def.reveal.loot;
  if (def.reveal?.loseTreasure && p) {
    const ts = treasures(p.hand);
    if (ts.length) {
      const card = pick(state.rng, ts);
      discardNow(state, p, card, `Baby dragonfire claims ${p.name}'s ${lootDef(card.defId).name}.`);
      const last = state.noticeQueue && state.noticeQueue[state.noticeQueue.length - 1];
      if (last) {
        last.after = () => {
          const actor = playerBySeat(state, info.seat);
          if (actor && actor.status === "active") continueRoom(state, actor);
          else nextTurn(state);
        };
      }
    }
  }
  if (flushNotices(state)) return;
  if (p && p.status === "active") continueRoom(state, p);
  else nextTurn(state);
}

function continueRoom(state, p) {
  const cell = state.board[p.loc];
  if (cell && cell.red > 0) {
    startCombat(state, p);
    return;
  }
  doLoot(state, p);
}

function startCombat(state, p) {
  const id = drawDenizen(state);
  if (!id) {
    log(state, "No denizens left in the deck.");
    doLoot(state, p);
    return;
  }
  const def = denizenDef(id);
  state.turn.combat = { denizenId: id, use: def.use === "choose" ? null : def.use };
  log(state, `${p.name} faces ${def.name}!`, p.seat);
  state.denizenReveal = {
    endsAt: Date.now() + DENIZEN_REVEAL_MS,
    seat: p.seat,
  };
  setPrompt(state, {
    type: "denizenReveal",
    seat: p.seat,
    text: `${p.name} faces ${def.name}!`,
    denizen: def,
  });
}

function finishDenizenReveal(state) {
  state.denizenReveal = null;
  const p = playerBySeat(state, state.turnSeat);
  if (!p || !state.turn?.combat) {
    if (p) afterSpaceResolved(state, p);
    else nextTurn(state);
    return;
  }
  const def = combatFoe(state);
  if (!def) {
    if (p) afterSpaceResolved(state, p);
    else nextTurn(state);
    return;
  }
  if (def.use === "choose") {
    setPrompt(state, {
      type: "chooseStat",
      seat: p.seat,
      text: `${def.name} (M ${def.might} / G ${def.guile}). Choose Might or Guile.`,
      denizen: def,
    });
    return;
  }
  offerCombat(state, p);
}

function combatUseOf(combat) {
  if (!combat) return "lower";
  if (combat.use === "might" || combat.use === "guile" || combat.use === "lower") return combat.use;
  return "lower";
}

function offerCombat(state, p) {
  const def = combatFoe(state);
  if (!def) return;
  const use = combatUseOf(state.turn.combat);
  const dcs = denizenScore(def, use, state);
  setPrompt(state, {
    type: "combat",
    seat: p.seat,
    text: `${p.name} faces ${def.name}!`,
    denizen: def,
    use,
    ...scoreFields(state, p, use),
    denizenCs: dcs,
    outlook: combatOutlook(state, p),
    canSacrifice: isDragonCombat(state),
    dragonPenalty: state.dragonPenalty || 0,
  });
}

function resolveCombat(state, p, auto) {
  if (!state.turn.combat || state.turn.combat.rolling) return;
  const outlook = combatOutlook(state, p);
  const kind = auto === "win" || auto === "lose" ? auto : outlook;
  if (kind === "win" || kind === "lose") {
    if (outlook !== kind) return;
    state.turn.combat.rolling = true;
    state.turn.combat.auto = kind;
    state.turn.combat.roll = kind === "win" ? 1 : 0;
    beginCombatPause(state, p);
    return;
  }
  state.turn.combat.rolling = true;
  const def = combatFoe(state);
  const use = combatUseOf(state.turn.combat);
  const n = rollDie(state, `vs ${def.name}`);
  state.turn.combat.roll = n;
  closeDice(state, "combatSettle");
  setPrompt(state, {
    type: "diceWait",
    seat: p.seat,
    text: `${p.name} rolls against ${def.name}...`,
    denizen: def,
    use,
    ...scoreFields(state, p, use),
    denizenCs: denizenScore(def, use, state),
  });
}

function beginCombatPause(state, p) {
  if (!state.turn?.combat) {
    afterSpaceResolved(state, p);
    return;
  }
  const def = combatFoe(state);
  if (!def) {
    afterSpaceResolved(state, p);
    return;
  }
  const { use, pcs, auto, roll, total } = combatRollTotal(state, p);
  const dcs = denizenScore(def, use, state);
  const win = auto === "win" ? true : auto === "lose" ? false : total > dcs;
  state.combatPause = { endsAt: Date.now() + COMBAT_PAUSE_MS };
  setPrompt(state, {
    type: "combatPause",
    seat: p.seat,
    text: auto === "win"
      ? `${p.name} auto-wins (${pcs}+1=${total} vs ${dcs}).`
      : auto === "lose"
        ? `${p.name} auto-loses (${pcs} vs ${dcs}).`
        : `${p.name} rolled ${roll} (${pcs} → ${total} vs ${dcs}).`,
    denizen: def,
    use,
    ...scoreFields(state, p, use),
    playerCs: pcs,
    playerTotal: total,
    roll: auto === "lose" ? null : roll,
    auto: auto || null,
    denizenCs: dcs,
    win,
  });
}

function combatRollTotal(state, p) {
  const use = combatUseOf(state.turn.combat);
  const pcs = combatScore(state, p, use);
  const auto = state.turn.combat.auto;
  const roll = combatDieAdd(state.turn.combat);
  return { use, pcs, auto, roll, total: pcs + roll };
}

function shouldOfferCombatBoost(state, p) {
  if (!p || p.status !== "active" || !state.turn?.combat) return false;
  if (isDragonCombat(state) || state.turn.combat.auto) return false;
  if (willIgnoreHit(state, p)) return false;
  const { total } = combatRollTotal(state, p);
  const dcs = denizenScore(combatFoe(state), combatUseOf(state.turn.combat), state);
  if (total > dcs) return false;
  const need = Math.max(1, dcs - total + 1);
  return p.hp > need;
}

function offerCombatBoost(state, p) {
  state.combatPause = null;
  const def = combatFoe(state);
  if (!def) {
    applyCombatOutcome(state);
    return;
  }
  const { use, pcs, roll, total } = combatRollTotal(state, p);
  const dcs = denizenScore(def, use, state);
  const need = Math.max(1, dcs - total + 1);
  setPrompt(state, {
    type: "combatBoost",
    seat: p.seat,
    text: `${p.name} can spend HP to raise their score (${total} vs ${dcs}).`,
    denizen: def,
    use,
    ...scoreFields(state, p, use),
    playerCs: pcs,
    playerTotal: total,
    roll,
    auto: null,
    denizenCs: dcs,
    win: false,
    hp: p.hp,
    need,
    canSpend: p.hp > need,
  });
}

function spendCombatHp(state, p, n) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  if (!state.turn?.combat || isDragonCombat(state) || state.turn.combat.auto) {
    return { ok: false, error: "Can't spend HP now." };
  }
  if (p.hp - n < 1) return { ok: false, error: "You can't spend your last HP." };
  p.hp -= n;
  state.turn.combat.hpBoost = (state.turn.combat.hpBoost || 0) + n;
  log(state, `${p.name} spends ${n} HP for +${n} combat. HP ${p.hp}/${p.maxHp}.`, p.seat);
  const def = combatFoe(state);
  const { use, total } = combatRollTotal(state, p);
  const dcs = denizenScore(def, use, state);
  const won = total > dcs;
  if (p.hp <= 0) {
    p.hp = 0;
    if (def && !isDragonCombat(state)) discardDenizen(state, state.turn.combat.denizenId);
    state.turn.combat = null;
    state._afterDeath = () => {
      if (state.phase === "play") nextTurn(state);
    };
    eliminate(state, p, "spent their last HP");
    return { ok: true };
  }
  if (won) {
    applyCombatOutcome(state);
    return { ok: true };
  }
  offerCombatBoost(state, p);
  return { ok: true };
}

function applyCombatOutcome(state) {
  state.combatPause = null;
  const p = playerBySeat(state, state.turnSeat);
  if (!p || !state.turn?.combat) {
    if (p) afterSpaceResolved(state, p);
    else nextTurn(state);
    return;
  }
  const def = combatFoe(state);
  if (!def) {
    afterSpaceResolved(state, p);
    return;
  }
  const { use, pcs, auto, roll, total } = combatRollTotal(state, p);
  const dcs = denizenScore(def, use, state);
  const win = auto === "win" ? true : auto === "lose" ? false : total > dcs;
  const dragon = isDragonCombat(state);
  if (!dragon) discardDenizen(state, state.turn.combat.denizenId);
  state.turn.combat = null;
  if (dragon) {
    const ignored = !win && willIgnoreHit(state, p);
    const loot = win && p.status === "active" ? drawLoot(state, escapeDrawCount(state)) : [];
    log(state, win
      ? (auto === "win" ? `${p.name} auto-wins vs ${def.name} (${pcs}+1=${total} vs ${dcs}).` : `${p.name} bests ${def.name} (${pcs}+${roll}=${total} vs ${dcs})!`)
      : (auto === "lose" ? `${p.name} auto-loses vs ${def.name} (${pcs} vs ${dcs}).` : `${def.name} wins (${pcs}+${roll}=${total} vs ${dcs}).`), p.seat);
    state.combatResult = {
      win,
      dragon: true,
      more: false,
      loot,
      seat: p.seat,
      ignored,
      denizen: def,
      endsAt: Date.now() + dialogMs(win ? (loot.length ? COMBAT_LOOT_MS : COMBAT_RESULT_MS) : COMBAT_WOUND_MS, p),
    };
    setPrompt(state, {
      type: "combatResult",
      seat: p.seat,
      text: win ? `${p.name} defeated ${def.name}!` : (ignored ? `${p.name} ignores the hit!` : "Wounded!"),
      win,
      wound: !win && !ignored,
      ignored,
      woundSeat: win ? undefined : p.seat,
      dragon: true,
      denizen: def,
      playerCs: total,
      denizenCs: dcs,
      loot: loot.map(publicLoot),
      more: false,
    });
    return;
  }
  if (win) {
    state.board[p.loc].red = Math.max(0, state.board[p.loc].red - 1);
    log(state, auto === "win"
      ? `${p.name} auto-wins vs ${def.name} (${pcs}+1=${total} vs ${dcs}).`
      : `${p.name} beats ${def.name} (${pcs}+${roll}=${total} vs ${dcs}).`, p.seat);
    const more = p.status === "active" && state.board[p.loc].red > 0;
    const loot = more || p.status !== "active" ? [] : drawRoomLoot(state, p);
    const hold = loot.length ? COMBAT_LOOT_MS : COMBAT_RESULT_MS;
    state.combatResult = {
      win: true,
      more,
      loot,
      seat: p.seat,
      denizen: def,
      endsAt: Date.now() + dialogMs(hold, p),
    };
    setPrompt(state, {
      type: "combatResult",
      seat: p.seat,
      text: `${p.name} defeated ${def.name}!`,
      win: true,
      denizen: def,
      playerCs: total,
      denizenCs: dcs,
      loot: loot.map(publicLoot),
      more,
    });
  } else {
    const ignored = willIgnoreHit(state, p);
    log(state, auto === "lose"
      ? `${p.name} auto-loses vs ${def.name} (${pcs} vs ${dcs}).`
      : `${def.name} wins (${pcs}+${roll}=${total} vs ${dcs}).`, p.seat);
    state.combatResult = {
      win: false,
      seat: p.seat,
      denizen: def,
      ignored,
      endsAt: Date.now() + dialogMs(COMBAT_WOUND_MS, p),
    };
    setPrompt(state, {
      type: "combatResult",
      seat: p.seat,
      text: ignored ? `${p.name} ignores the hit!` : "Wounded!",
      win: false,
      wound: !ignored,
      ignored,
      woundSeat: p.seat,
      denizen: def,
      playerCs: total,
      denizenCs: dcs,
    });
  }
}

function finishCombatResult(state) {
  const info = state.combatResult;
  state.combatResult = null;
  if (!info) {
    nextTurn(state);
    return;
  }
  const p = playerBySeat(state, info.seat);
  if (!p) {
    nextTurn(state);
    return;
  }
  if (info.win) {
    if (info.loot?.length) {
      p.hand.push(...info.loot);
      log(state, `${p.name} loots ${info.loot.length} card${info.loot.length > 1 ? "s" : ""}.`, p.seat);
    }
    if (info.dragon) {
      if (p.status === "active") escapePlayer(state, p, { skipDraw: true });
      enforceCarry(state, p);
      return;
    }
    if (info.more && p.status === "active") {
      startCombat(state, p);
      return;
    }
    if (p.status === "active") enforceCarry(state, p);
    else nextTurn(state);
    return;
  }
  if (info.catHit || info.catWound || info.catDump) {
    const v = playerBySeat(state, info.woundSeat);
    const after = typeof info.after === "function"
      ? info.after
      : () => {
        const actor = playerBySeat(state, state.turnSeat);
        if (actor && actor.status === "active") applyEndOfTurn(state, actor);
        else nextTurn(state);
      };
    if (info.catDump && info.card && v) {
      const card = takeCard(v.hand, info.card.uid);
      if (card) {
        state.treasurePile.push(card);
        log(state, `${info.catName || "A cat"} bowls into ${v.name}, who dumps ${lootDef(card.defId).name} on the Treasure Pile.`, v.seat);
      }
    } else if (v) {
      state._afterDeath = () => showPendingCatWound(state, after);
      hurt(state, v, 1, `${info.catName || "a cat"}'s claws`);
      if (state.prompt?.type === "deathAnnounce") return;
      state._afterDeath = null;
    }
    showPendingCatWound(state, after);
    return;
  }
  state._afterDeath = () => afterSpaceResolved(state, p);
  hurt(state, p, 1, info.denizen?.name || "a denizen");
  if (state.prompt?.type === "deathAnnounce") return;
  state._afterDeath = null;
  afterSpaceResolved(state, p);
}

function drawRoomLoot(state, p) {
  const cell = state.board[p.loc];
  const n = cell?.yellow || 0;
  if (n <= 0) return [];
  cell.yellow = 0;
  return drawLoot(state, n);
}

function doLoot(state, p) {
  if (p.status !== "active") {
    nextTurn(state);
    return;
  }
  const cards = drawRoomLoot(state, p);
  if (cards.length) {
    showLootGain(state, p, cards);
    return;
  }
  enforceCarry(state, p);
}

function showLootGain(state, p, cards) {
  state.lootResult = {
    seat: p.seat,
    loot: cards,
    endsAt: Date.now() + COMBAT_LOOT_MS,
  };
  setPrompt(state, {
    type: "lootResult",
    seat: p.seat,
    text: `${p.name} finds loot!`,
    loot: cards.map(publicLoot),
  });
}

function finishLootResult(state) {
  const info = state.lootResult;
  state.lootResult = null;
  const p = playerBySeat(state, info?.seat);
  if (info?.loot?.length && p) {
    p.hand.push(...info.loot);
    log(state, `${p.name} loots ${info.loot.length} card${info.loot.length > 1 ? "s" : ""}.`, p.seat);
  }
  if (typeof info?.after === "function") {
    info.after();
    return;
  }
  if (flushNotices(state)) return;
  if (flushDiscardQueue(state)) return;
  if (p) enforceCarry(state, p);
  else nextTurn(state);
}

function enforceCarry(state, p) {
  if (!p) {
    nextTurn(state);
    return;
  }
  const cap = strengthOf(p);
  if (p.hand.length <= cap) {
    if (state.pendingCarrySeat === p.seat) state.pendingCarrySeat = null;
    if (p.status === "escaped") {
      checkEnd(state);
      if (state.phase === "play") nextTurn(state);
      return;
    }
    if (p.status !== "active") {
      nextTurn(state);
      return;
    }
    finishTurn(state, p);
    return;
  }
  setPrompt(state, {
    type: "overCarry",
    seat: p.seat,
    text: `Sack full (${p.hand.length}/${cap}). Use or discard loot until you can carry it.`,
    cap,
  });
}

function enforceEnc(state, p) {
  enforceCarry(state, p);
}

function finishTurn(state, p) {
  afterSpaceResolved(state, p);
}

function nextTurn(state) {
  if (state.phase !== "play") return;
  const nxt = clockwiseFrom(state, state.turnSeat);
  if (!nxt) {
    checkEnd(state);
    return;
  }
  const actives = activePlayers(state);
  const minActive = actives.length ? Math.min(...actives.map((x) => x.seat)) : nxt.seat;
  if (nxt.seat === minActive && actives.length > 1) state.round += 1;
  state.turnSeat = nxt.seat;
  beginTurn(state);
}

function offerDragon(state, p) {
  state.turn.phase = "dragon";
  state.turn.combat = { denizenId: "dragon", use: "lower", dragon: true };
  offerCombat(state, p);
}

function resolveDragon(state, p) {
  if (!state.turn?.combat) {
    state.turn.combat = { denizenId: "dragon", use: "lower", dragon: true };
  }
  resolveCombat(state, p);
}

function scrollLegalNow(state, actor, defId) {
  const def = lootDef(defId);
  if (!def || !isScroll(defId)) return false;
  const pr = state.prompt?.type;
  const timing = def.timing;
  if (pr === "overCarry") {
    if (timing === "fork") return false;
    const others = activePlayers(state).filter((o) => o.seat !== actor.seat);
    if (!others.length && ["yoink", "trashing", "scrapping", "who_wants", "impede", "everyone"].includes(defId)) return false;
    return true;
  }
  if (timing === "fork") return false;
  if (timing === "combat") {
    if (pr !== "combat" && pr !== "dragon") return false;
    if (defId === "fog" && isDragonCombat(state)) return false;
    return true;
  }
  if (timing === "preMove") return pr === "preMove";
  if (timing === "turn") {
    if (!["preMove", "combat", "dragon"].includes(pr)) return false;
  } else return false;
  const others = activePlayers(state).filter((o) => o.seat !== actor.seat);
  if (!others.length && ["yoink", "trashing", "scrapping", "who_wants", "impede", "everyone"].includes(defId)) return false;
  return true;
}

function playScroll(state, p, uid, extra = {}) {
  const card = p.hand.find((c) => c.uid === uid);
  if (!card || !isScroll(card.defId)) return { ok: false, error: "Not a scroll." };
  const def = lootDef(card.defId);
  const timing = def.timing;
  const phase = state.turn?.phase;
  const isTurnOwner = state.turnSeat === p.seat;

  if (state.prompt?.type === "overCarry" && isTurnOwner) {
    if (timing === "fork") return { ok: false, error: "Fork is only a reaction when you are targeted." };
  } else if (timing === "combat") {
    if (state.prompt?.type !== "combat" && state.prompt?.type !== "dragon") {
      return { ok: false, error: "Play that during combat." };
    }
  } else if (timing === "preMove") {
    if (state.prompt?.type !== "preMove" || !isTurnOwner) {
      return { ok: false, error: "Haste is for the movement phase of a turn." };
    }
  } else if (timing === "fork") {
    return { ok: false, error: "Fork is only a reaction when you are targeted." };
  } else if (timing === "turn") {
    if (!isTurnOwner || !["preMove", "combat", "dragon"].includes(state.prompt?.type)) {
      return { ok: false, error: "You can play that on your turn." };
    }
  }

  return resolveScrollPlay(state, p, card, extra);
}

function resolveScrollPlay(state, p, card, extra, { skipFork = false } = {}) {
  extra = extra || {};
  if (extra.targetSeat != null && extra.targetSeat !== "denizen") {
    const tgt = playerBySeat(state, extra.targetSeat);
    if (!tgt) return { ok: false, error: "Need a target." };
    if (tgt.status !== "active") return { ok: false, error: "They're out of the den." };
  }
  const def = lootDef(card.defId);
  const singleTarget = ["munchies", "nectar", "yoink", "trashing", "over_there", "impede", "everyone"].includes(card.defId);
  if (!skipFork && singleTarget && extra.targetSeat != null && extra.targetSeat !== p.seat) {
    const tgt = playerBySeat(state, extra.targetSeat);
    const fork = tgt && tgt.status === "active" && tgt.hand.find((c) => c.defId === "fork");
    if (fork) {
      startReaction(state, "fork", REACTION_MS, {
        targetSeat: tgt.seat,
        casterSeat: p.seat,
        original: { cardUid: card.uid, casterSeat: p.seat, extra, defId: card.defId },
        text: `${def.name} targets ${tgt.name}. They may Fork You Too, Buddy!`,
      });
      return { ok: true, pending: true };
    }
  }

  takeCard(p.hand, card.uid);
  state.decks.lootDiscard.push(card.defId);
  const res = applyScroll(state, p, card.defId, extra);
  if (!res.ok) {
    const idx = state.decks.lootDiscard.lastIndexOf(card.defId);
    if (idx >= 0) state.decks.lootDiscard.splice(idx, 1);
    p.hand.push(card);
    return res;
  }
  log(state, `${p.name} plays ${def.name}.`, p.seat);
  return res;
}

function applyScroll(state, p, defId, extra) {
  switch (defId) {
    case "munchies":
    case "nectar": {
      const t = playerBySeat(state, extra.targetSeat);
      if (!t || t.status !== "active") return { ok: false, error: "Need a living target." };
      const amt = defId === "nectar" ? 5 : 3;
      t.hp = Math.min(t.maxHp, t.hp + amt);
      log(state, `${t.name} gains ${amt} HP.`);
      return { ok: true };
    }
    case "yoink": {
      const t = playerBySeat(state, extra.targetSeat);
      if (!t || t.id === p.id) return { ok: false, error: "Pick another player." };
      if (t.status !== "active") return { ok: false, error: "They're out of the den." };
      if (!t.hand.length) return { ok: false, error: "They have no loot." };
      setPrompt(state, {
        type: "yoinkPick",
        seat: p.seat,
        fromSeat: t.seat,
        text: `Steal a card from ${t.name}.`,
        resume: snapshotPrompt(state),
      });
      state._stashPrompt = state._stashPrompt; // placeholder
      return { ok: true, replacePrompt: true };
    }
    case "trashing": {
      const t = playerBySeat(state, extra.targetSeat);
      if (!t || t.id === p.id) return { ok: false, error: "Pick another player." };
      if (t.status !== "active") return { ok: false, error: "They're out of the den." };
      forceDiscard(state, t, "Loot", `${t.name} is forced to discard by ${p.name}'s Scroll of Trashing.`);
      return { ok: true };
    }
    case "scrapping": {
      for (const o of activePlayers(state)) {
        if (o.seat === p.seat) continue;
        forceDiscard(state, o, "Loot", `${o.name} is forced to discard by ${p.name}'s Scroll of Scrapping.`);
      }
      return { ok: true };
    }
    case "over_there": {
      const t = playerBySeat(state, extra.targetSeat);
      if (!t || t.status !== "active") return { ok: false, error: "Need a target." };
      ambush(state, t);
      return { ok: true };
    }
    case "fog": {
      if (isDragonCombat(state)) return { ok: false, error: "Fog cannot hide the Dragon." };
      if (state.turn?.combat) {
        discardDenizen(state, state.turn.combat.denizenId);
        state.turn.combat = null;
        log(state, "Fog rolls in. The denizen is gone; red chits remain.");
        const tp = playerBySeat(state, state.turnSeat);
        if (tp) doLoot(state, tp);
      }
      return { ok: true };
    }
    case "who_wants": {
      startReaction(state, "who", REACTION_MS, {
        casterSeat: p.seat,
        text: `${p.name} asks: Who wants it? Name a player!`,
      });
      return { ok: true, pending: true };
    }
    case "kitty": {
      beginCatAnnounce(state, p.seat, null, "kittyPick", { saved: stashCurrentPrompt(state) });
      return { ok: true, replacePrompt: true };
    }
    case "in_the_cup": {
      startReaction(state, "cup", CUP_MS, {
        casterSeat: p.seat,
        lastSeat: p.seat,
        text: `${p.name} says IN THE CUP! Tap the button — fastest wins, slowest discards an item.`,
      });
      return { ok: true, pending: true };
    }
    case "peace": {
      const need = activePlayers(state).filter((o) => treasures(o.hand).length);
      if (!need.length) return { ok: true };
      state.pendingPass = { dir: "left", remaining: need.map((o) => o.seat), picks: {} };
      askPass(state);
      return { ok: true, replacePrompt: true };
    }
    case "war": {
      const act = activePlayers(state);
      const moving = [];
      for (const o of act) {
        const ts = treasures(o.hand);
        if (!ts.length) continue;
        const card = pick(state.rng, ts);
        takeCard(o.hand, card.uid);
        moving.push({ from: o.seat, card });
      }
      for (const m of moving) {
        const fromP = playerBySeat(state, m.from);
        const idx = act.findIndex((x) => x.seat === m.from);
        const to = act[(idx - 1 + act.length) % act.length];
        to.hand.push(m.card);
        log(state, `${fromP.name} is forced to pass ${lootDef(m.card.defId).name} right to ${to.name}.`);
        enqueueNotice(state, {
          seat: to.seat,
          kind: "gain",
          title: "Times of War",
          text: `${fromP.name} is forced to pass ${lootDef(m.card.defId).name} to ${to.name}.`,
          cards: [m.card],
        });
      }
      return { ok: true };
    }
    case "redistribute": {
      const act = activePlayers(state);
      const pile = [];
      for (const o of act) pile.push(...o.hand.splice(0));
      const shuffled = shuffle(state.rng, pile);
      let i = act.findIndex((x) => x.seat === p.seat);
      for (const card of shuffled) {
        act[i % act.length].hand.push(card);
        i += 1;
      }
      log(state, "Loot is shuffled and dealt anew.");
      for (const o of act) {
        if (!o.hand.length) continue;
        enqueueNotice(state, {
          seat: o.seat,
          kind: "gain",
          title: "Wealth Redistribution",
          text: `${o.name} is dealt new loot.`,
          cards: o.hand.slice(),
        });
      }
      return { ok: true };
    }
    case "impede": {
      const t = playerBySeat(state, extra.targetSeat);
      if (!t || t.id === p.id) return { ok: false, error: "Pick another player." };
      if (t.status !== "active") return { ok: false, error: "They're out of the den." };
      if (!t.lastRoomLeft) {
        log(state, `${t.name} has no previous room to return to.`);
        return { ok: true };
      }
      t.loc = t.lastRoomLeft;
      log(state, `${t.name} is impeded back to a previous room.`);
      return { ok: true };
    }
    case "haste": {
      state.turn.haste += 1;
      log(state, "Haste: an extra d6 will be added to the move roll.");
      return { ok: true };
    }
    case "empty": {
      const loc = extra.roomId;
      if (!state.board[loc] || getSpace(loc)?.type !== "room") return { ok: false, error: "Pick a room." };
      state.board[loc].yellow = 0;
      log(state, `Treasure chits vanish from a room.`);
      return { ok: true };
    }
    case "missed": {
      const loc = extra.roomId;
      if (!state.board[loc] || getSpace(loc)?.type !== "room") return { ok: false, error: "Pick a room." };
      state.board[loc].yellow += 1;
      log(state, `A treasure chit appears in a room.`);
      return { ok: true };
    }
    case "everyone": {
      const named = extra.targetSeat;
      const namedP = named != null ? playerBySeat(state, named) : null;
      if (namedP && namedP.status !== "active") return { ok: false, error: "They're out of the den." };
      for (const o of activePlayers(state)) {
        if (o.seat === named) continue;
        const got = drawLoot(state, 1);
        if (!got.length) continue;
        o.hand.push(...got);
        log(state, `${o.name} draws a Loot card.`);
        enqueueNotice(state, {
          seat: o.seat,
          kind: "gain",
          title: "Loot!",
          text: `${o.name} draws loot from Everyone But You.`,
          cards: got,
        });
      }
      return { ok: true };
    }
    case "destrong":
    case "desmart":
    case "enstrong":
    case "ensmart": {
      const tSeat = extra.targetSeat;
      const t = tSeat === "denizen" ? null : playerBySeat(state, tSeat);
      const key = t ? t.seat : "denizen";
      state.combatMods[key] = state.combatMods[key] || {};
      if (defId === "destrong") state.combatMods[key].mightSet = 1;
      if (defId === "desmart") state.combatMods[key].guileSet = 1;
      if (defId === "enstrong") state.combatMods[key].mightAdd = (state.combatMods[key].mightAdd || 0) + 3;
      if (defId === "ensmart") state.combatMods[key].guileAdd = (state.combatMods[key].guileAdd || 0) + 3;
      if (state.prompt?.type === "combat" || state.prompt?.type === "dragon") {
        const tp = playerBySeat(state, state.turnSeat);
        if (tp) offerCombat(state, tp);
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown scroll." };
  }
}

function stashCurrentPrompt(state) {
  return state.prompt ? clone(state.prompt) : null;
}

function snapshotPrompt(state) {
  return state.prompt ? clone(state.prompt) : null;
}

function forceDiscard(state, t, kind, why) {
  const pool = kind === "Item" || kind === "Treasure" ? treasures(t.hand) : t.hand;
  if (!pool.length) {
    log(state, `${t.name} has nothing to discard.`);
    return;
  }
  const reason = why || `${t.name} discards a card.`;
  if (pool.length === 1 || t.isAI) {
    discardNow(state, t, pick(state.rng, pool), reason);
    return;
  }
  state.discardQueue = state.discardQueue || [];
  state.discardQueue.push({ seat: t.seat, kind, why: reason });
}

function flushDiscardQueue(state) {
  if (state.reaction) return false;
  if (state.prompt && ["discardEnc", "overCarry", "discardItem", "yoinkPick", "passTreasure", "kittyPick", "kittyMove", "lootResult", "combatResult"].includes(state.prompt.type)) {
    return false;
  }
  if (state.pendingPass) return false;
  if (!state.discardQueue?.length) return false;
  const job = state.discardQueue[0];
  const t = playerBySeat(state, job.seat);
  if (!t || t.status !== "active") {
    state.discardQueue.shift();
    return flushDiscardQueue(state);
  }
  const pool = job.kind === "Item" || job.kind === "Treasure" ? treasures(t.hand) : t.hand;
  if (!pool.length) {
    state.discardQueue.shift();
    return flushDiscardQueue(state);
  }
  if (pool.length === 1 || t.isAI) {
    discardNow(state, t, pick(state.rng, pool), job.why || `${t.name} discards a card.`);
    state.discardQueue.shift();
    if (flushNotices(state)) return true;
    return flushDiscardQueue(state);
  }
  setPrompt(state, {
    type: "discardItem",
    seat: t.seat,
    kind: job.kind,
    why: job.why,
    text: job.why || `Discard ${job.kind === "Item" ? "an item" : "a Loot card"}.`,
  });
  return true;
}

function askPass(state) {
  const job = state.pendingPass;
  if (!job || !job.remaining.length) {
    if (job) {
      const act = activePlayers(state);
      for (const [seatStr, uid] of Object.entries(job.picks)) {
        const from = playerBySeat(state, Number(seatStr));
        const card = takeCard(from.hand, uid);
        if (!card) continue;
        const idx = act.findIndex((x) => x.seat === from.seat);
        const to = act[(idx + 1) % act.length];
        to.hand.push(card);
        log(state, `${from.name} passes ${lootDef(card.defId).name} left to ${to.name}.`);
        enqueueNotice(state, {
          seat: to.seat,
          kind: "gain",
          title: "Times of Peace",
          text: `${from.name} passes ${lootDef(card.defId).name} to ${to.name}.`,
          cards: [card],
        });
      }
      state.pendingPass = null;
    }
    restoreOrPreMove(state);
    return;
  }
  const seat = job.remaining[0];
  const p = playerBySeat(state, seat);
  const ts = treasures(p.hand);
  if (!ts.length) {
    job.remaining.shift();
    askPass(state);
    return;
  }
  if (ts.length === 1 || p.isAI) {
    job.picks[seat] = pick(state.rng, ts).uid;
    job.remaining.shift();
    askPass(state);
    return;
  }
  setPrompt(state, {
    type: "passTreasure",
    seat,
    text: "Times of Peace: pass a Treasure left.",
  });
}

function restoreOrPreMove(state) {
  if (flushNotices(state)) return;
  if (flushDiscardQueue(state)) return;
  if (state.turn) state.turn._kitty = null;
  if (state.pendingCarrySeat != null) {
    const carrier = playerBySeat(state, state.pendingCarrySeat);
    state.pendingCarrySeat = null;
    if (carrier) {
      enforceCarry(state, carrier);
      return;
    }
  }
  const p = playerBySeat(state, state.turnSeat);
  if (!p || p.status !== "active") {
    nextTurn(state);
    return;
  }
  if (state.turn?.phase === "preMove") offerPreMove(state, p);
  else if (state.turn?.phase === "move") promptMove(state, p);
  else if ((state.turn?.phase === "catMove" || state.turn?.phase === "catPick") && state.turn.catId && state.turn.catSteps > 0) {
    const cat = state.cats.find((c) => c.id === state.turn.catId);
    if (cat) promptCatStep(state, p, cat, false);
    else applyEndOfTurn(state, p);
  }
  else if (state.turn?.combat) offerCombat(state, p);
  else if (state.turn?.phase === "dragon") offerDragon(state, p);
  else if (state.prompt && !["walkWait", "catAnnounce", "fightAnnounce", "diceWait", "kittyPick", "kittyMove"].includes(state.prompt.type)) return;
  else finishTurn(state, p);
}

function ambush(state, t) {
  const id = drawDenizen(state);
  if (!id) {
    log(state, "No denizen appears.");
    return;
  }
  const def = denizenDef(id);
  let use = def.use;
  if (use === "choose") use = mightOf(state, t) >= guileOf(state, t) ? "might" : "guile";
  const pcs = combatScore(state, t, use === "might" || use === "guile" ? use : "lower");
  const dcs = denizenScore(def, use === "choose" ? "might" : use, state);
  discardDenizen(state, id);
  if (pcs > dcs) {
    log(state, `${t.name} swats ${def.name} (CS ${pcs} vs ${dcs}).`, t.seat);
  } else {
    log(state, `${def.name} ambushes ${t.name} (CS ${pcs} vs ${dcs}).`, t.seat);
    state._afterDeath = () => restoreOrPreMove(state);
    hurt(state, t, 1, def.name);
    if (state.prompt?.type === "deathAnnounce") return;
    state._afterDeath = null;
  }
}

function doMoveRoll(state, p) {
  const ch = getCharacter(p.characterId);
  const d1 = rollDie(state, "movement");
  state.turn.primaryDie = d1;
  state.turn.moveDice = [d1];
  let steps = d1 + (ch.ability === "rogue_move" ? 1 : 0);
  for (let i = 0; i < state.turn.haste; i++) {
    const h = rollDie(state, "haste");
    state.turn.moveDice.push(h);
    steps += h;
  }
  state.turn.stepsLeft = steps;
  state.turn.phase = "move";
  state.turn.needsMove = true;
  closeDice(state, "promptMove");
  log(state, `${p.name} may move ${steps} space${steps === 1 ? "" : "s"}.`, p.seat);
  setPrompt(state, { type: "diceWait", seat: p.seat, text: `${p.name} rolls movement...` });
}

function promptMove(state, p) {
  if (p.status !== "active") {
    state.turn.needsMove = false;
    nextTurn(state);
    return;
  }
  if (state.turn.stepsLeft <= 0) {
    state.turn.needsMove = false;
    afterMoveResolved(state, p);
    return;
  }
  const reach = playerReachable(state, p);
  const opts = reach.map((r) => r.id);
  if (!opts.length) {
    log(state, `${p.name} has no legal move.`);
    state.turn.needsMove = false;
    afterMoveResolved(state, p);
    return;
  }
  state.turn.needsMove = false;
  setPrompt(state, {
    type: "move",
    seat: p.seat,
    text: `Move: ${state.turn.stepsLeft} left. Click any highlighted space.`,
    options: opts,
  });
}

function spaceStopsPlayer(state, id) {
  const sp = getSpace(id);
  if (!sp) return false;
  if (sp.type === "dragon") return true;
  if (sp.type === "room") {
    const cell = state.board[id];
    return !!(cell && cell.red > 0);
  }
  return false;
}

function playerReachable(state, p) {
  const from = p.loc;
  const max = state.turn.stepsLeft;
  const best = new Map();
  const q = [{ id: from, left: max, path: [from] }];
  const seen = new Set([`${from}|${max}`]);
  while (q.length) {
    const cur = q.shift();
    if (cur.id !== from) {
      const prev = best.get(cur.id);
      if (!prev || cur.path.length < prev.path.length) best.set(cur.id, cur);
    }
    if (cur.left <= 0) continue;
    if (cur.id !== from && spaceStopsPlayer(state, cur.id)) continue;
    for (const n of playerNeighbors(cur.id)) {
      const left = cur.left - 1;
      const key = `${n}|${left}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push({ id: n, left, path: cur.path.concat(n) });
    }
  }
  return [...best.values()];
}

function stepPlayerOnce(state, p, dest) {
  if (!playerNeighbors(p.loc).includes(dest)) return { ok: false };
  const from = p.loc;
  const fromSp = getSpace(from);
  p.loc = dest;
  state.turn.stepsLeft -= 1;
  if (fromSp?.type === "room") p.lastRoomLeft = from;
  if (getSpace(dest)?.type === "room") p.lastRoom = dest;
  const stop = !!(spaceStopsPlayer(state, dest) || state.turn.stepsLeft <= 0);
  if (stop) state.turn.stepsLeft = 0;
  return { ok: true, stop };
}

function doPlayerMove(state, p, dest) {
  if (dest === p.loc) return { ok: false, error: "Already there." };
  const hit = playerReachable(state, p).find((r) => r.id === dest);
  if (!hit) return { ok: false, error: "Illegal space." };
  const steps = hit.path.slice(1);
  log(state, `${p.name} moves ${steps.length} space${steps.length === 1 ? "" : "s"}.`, p.seat);
  const taken = [p.loc];
  for (const id of steps) {
    const r = stepPlayerOnce(state, p, id);
    if (!r.ok) return { ok: false, error: "Illegal space." };
    taken.push(id);
    if (r.stop) {
      setWalkFx(state, "p-" + p.seat, taken);
      holdWalk(state, () => afterMoveResolved(state, p));
      return { ok: true };
    }
  }
  setWalkFx(state, "p-" + p.seat, taken);
  holdWalk(state, () => promptMove(state, p));
  return { ok: true };
}

function startCatMove(state, p, catId) {
  const cat = state.cats.find((c) => c.id === catId);
  if (!cat || cat.role === "C") return { ok: false, error: "Pick Nox or Griselbrand." };
  state.turn.catId = catId;
  state.turn.phase = "catMove";
  const steps = rollDie(state, `${cat.name} movement`);
  state.turn.catSteps = steps;
  closeDice(state, "catStep");
  setPrompt(state, { type: "diceWait", seat: p.seat, text: `${cat.name} is on the move...` });
  return { ok: true };
}

function promptCatStep(state, p, cat, optionalStop) {
  if (state.turn.catSteps <= 0) {
    applyEndOfTurn(state, p);
    return;
  }
  const opts = catDestOptions(state, cat, state.turn.catSteps);
  if (!opts.length) {
    applyEndOfTurn(state, p);
    return;
  }
  setPrompt(state, {
    type: "catMove",
    seat: p.seat,
    catId: cat.id,
    text: `Move ${cat.name}: ${state.turn.catSteps} left. Click any highlighted space.`,
    options: opts,
    canStop: optionalStop,
  });
}

function catReachable(state, cat, steps) {
  if (!cat || steps <= 0) return [];
  const from = cat.loc;
  const best = new Map();
  const q = [{ id: from, left: steps, path: [from] }];
  const seen = new Set([`${from}|${steps}`]);
  while (q.length) {
    const cur = q.shift();
    if (cur.id !== from) {
      const prev = best.get(cur.id);
      if (!prev || cur.path.length < prev.path.length) best.set(cur.id, cur);
    }
    if (cur.left <= 0) continue;
    if (cur.id !== from && playersOn(state, cur.id).length) continue;
    for (const n of catNeighbors(cur.id)) {
      const left = cur.left - 1;
      const key = `${n}|${left}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push({ id: n, left, path: cur.path.concat(n) });
    }
  }
  return [...best.values()];
}

function catDestOptions(state, cat, steps) {
  return catReachable(state, cat, steps).map((r) => r.id);
}

function walkCatTo(state, cat, dest, stepsLeft) {
  if (!cat) return { ok: false, error: "No cat." };
  if (dest === cat.loc) return { ok: false, error: "Already there." };
  const hit = catReachable(state, cat, stepsLeft).find((r) => r.id === dest);
  if (!hit) return { ok: false, error: "Illegal space." };
  let left = stepsLeft;
  let bump = false;
  const taken = [cat.loc];
  for (const id of hit.path.slice(1)) {
    const r = moveCatStep(state, cat, id);
    if (!r) return { ok: false, error: "Cats can't go there." };
    taken.push(id);
    left -= 1;
    if (r === "hit") {
      bump = true;
      break;
    }
  }
  setWalkFx(state, "c-" + cat.id, taken);
  return { ok: true, left, hit: bump };
}

function setWalkFx(state, token, path) {
  if (!path || path.length < 2) return;
  state.walkSeq = (state.walkSeq || 0) + 1;
  state.walkFx = { seq: state.walkSeq, token, path: path.slice() };
  state.walkUntil = Date.now() + (path.length - 1) * WALK_HOP_MS + 80;
}

function holdWalk(state, resume) {
  const go = () => showPendingCatWound(state, resume);
  const until = state.walkUntil || 0;
  if (Date.now() >= until) {
    go();
    return;
  }
  state._afterWalk = go;
  setPrompt(state, {
    type: "walkWait",
    seat: state.prompt?.seat ?? state.turnSeat,
    text: "On the move…",
  });
}

function dialogMs(base, p) {
  return p?.isAI ? Math.max(400, Math.floor(base / 2)) : base;
}

function resolveWho(state, namedSeat) {
  const caster = state.reaction?.casterSeat;
  clearReaction(state);
  if (namedSeat == null || namedSeat === caster) {
    const opts = activePlayers(state).filter((p) => p.seat !== caster);
    namedSeat = opts.length ? pick(state.rng, opts).seat : null;
  }
  const t = playerBySeat(state, namedSeat);
  if (t && t.status === "active") {
    const ts = treasures(t.hand);
    if (ts.length) {
      discardNow(state, t, pick(state.rng, ts), `${t.name} was named and discards an item.`);
    } else log(state, `${t.name} was named but has no item.`);
  }
  restoreOrPreMove(state);
}

function tick(state, now = Date.now()) {
  let changed = false;
  if (state.phase === "first" && state.prompt?.type === "petCat" && now >= state.prompt.endsAt) {
    const humans = state.players.filter((p) => !p.isAI);
    const w = pick(state.rng, humans.length ? humans : state.players);
    log(state, `Nobody claimed the cat. ${w.name} goes first.`);
    startPicking(state, w.seat);
    return { changed: true };
  }
  if (state.diceFx && state.diceFx.after && now >= state.diceFx.endsAt) {
    finishDice(state);
    changed = true;
  }
  if (state._afterWalk && now >= (state.walkUntil || 0)) {
    const fn = state._afterWalk;
    state._afterWalk = null;
    try {
      fn();
    } catch (err) {
      restoreOrPreMove(state);
    }
    if (state.prompt?.type === "walkWait") restoreOrPreMove(state);
    changed = true;
  }
  if (state.prompt?.type === "turnAnnounce" && state.turnAnnounce && now >= state.turnAnnounce.endsAt) {
    finishTurnAnnounce(state);
    changed = true;
  }
  if (state.prompt?.type === "catAnnounce" && state.catAnnounce && now >= state.catAnnounce.endsAt) {
    finishCatAnnounce(state);
    changed = true;
  }
  if (state.prompt?.type === "fightAnnounce" && state.fightAnnounce && now >= state.fightAnnounce.endsAt) {
    finishFightAnnounce(state);
    changed = true;
  }
  if (state.prompt?.type === "deathAnnounce" && state.deathAnnounce && now >= state.deathAnnounce.endsAt) {
    finishDeathAnnounce(state);
    changed = true;
  }
  if (state.prompt?.type === "roomReveal" && state.roomReveal && now >= state.roomReveal.endsAt) {
    const p = playerBySeat(state, state.prompt.seat);
    if (!p || p.isAI || p.status !== "active") {
      applyRoomReveal(state);
      changed = true;
    }
  }
  if (state.prompt?.type === "denizenReveal" && state.denizenReveal && now >= state.denizenReveal.endsAt) {
    finishDenizenReveal(state);
    changed = true;
  }
  if (state.prompt?.type === "combatPause" && state.combatPause && now >= state.combatPause.endsAt && !state.reaction) {
    const p = playerBySeat(state, state.turnSeat);
    if (shouldOfferCombatBoost(state, p)) offerCombatBoost(state, p);
    else applyCombatOutcome(state);
    changed = true;
  }
  if (state.prompt?.type === "combatResult" && state.combatResult && !state.reaction) {
    const info = state.combatResult;
    const shared = !!(info.catHit || info.catWound || info.catDump);
    const p = playerBySeat(state, state.prompt.seat);
    const livingHumans = state.players.filter((x) => !x.isAI && x.status === "active");
    const auto = shared ? !livingHumans.length : (!p || p.isAI || p.status !== "active");
    if (auto && (p?.status !== "active" || now >= info.endsAt)) {
      finishCombatResult(state);
      changed = true;
    }
  }
  if (state.prompt?.type === "lootResult" && state.lootResult && !state.reaction) {
    const p = playerBySeat(state, state.prompt.seat);
    const auto = !p || p.isAI || p.status !== "active";
    if (auto && (p?.status !== "active" || now >= state.lootResult.endsAt)) {
      finishLootResult(state);
      changed = true;
    }
  }
  if (state.prompt?.type === "raceResult" && state.raceResult && !state.reaction) {
    const humans = state.players.filter((p) => !p.isAI && p.status === "active");
    if (!humans.length) {
      finishRaceResult(state);
      changed = true;
    }
  }
  if (state.reaction && now >= state.reaction.endsAt) {
    const r = state.reaction;
    if (r.type === "double" || r.type === "cup") {
      resolveRace(state);
    } else if (r.type === "who") {
      resolveWho(state, null);
    } else if (r.type === "fork") {
      const orig = r.original;
      clearReaction(state);
      const caster = playerBySeat(state, orig.casterSeat);
      const card = caster.hand.find((c) => c.uid === orig.cardUid);
      if (caster && card) resolveScrollPlay(state, caster, card, orig.extra, { skipFork: true });
    } else {
      clearReaction(state);
    }
    changed = true;
  }
  return { changed };
}

function startPicking(state, firstSeat) {
  state.firstSeat = firstSeat;
  state.phase = "pick";
  state.pickSeat = firstSeat;
  promptPick(state);
}

function promptPick(state) {
  const p = playerBySeat(state, state.pickSeat);
  const taken = new Set(state.players.map((x) => x.characterId).filter(Boolean));
  const left = CHARACTERS.filter((c) => !taken.has(c.id));
  if (!p) return;
  if (!left.length) return;
  if (p.isAI) {
    assignCharacter(state, p, pick(state.rng, left).id);
    return;
  }
  setPrompt(state, {
    type: "pickCharacter",
    seat: p.seat,
    text: "Choose your adventurer.",
    options: left.map((c) => c.id),
  });
}

function assignCharacter(state, p, characterId) {
  const ch = getCharacter(characterId);
  if (!ch) return { ok: false, error: "Unknown class." };
  if (state.players.some((x) => x.characterId === characterId)) {
    return { ok: false, error: "Already taken." };
  }
  p.characterId = characterId;
  p.maxHp = ch.health;
  p.hp = ch.health;
  if (p.isAI) p.name = ch.name;
  log(state, `${p.name} is ${ch.name} the ${ch.className}.`, p.seat);
  const seats = state.players.map((x) => x.seat).sort((a, b) => a - b);
  const i = seats.indexOf(p.seat);
  const nextSeat = seats[(i + 1) % seats.length];
  if (state.players.every((x) => x.characterId)) {
    dealBoard(state);
    return { ok: true };
  }
  state.pickSeat = nextSeat;
  promptPick(state);
  return { ok: true };
}

function dealBoard(state) {
  const rooms = shuffle(state.rng, ROOM_CARDS.map((c) => c.id));
  const roomIds = BOARD.roomIds;
  for (let i = 0; i < roomIds.length; i++) {
    const id = roomIds[i];
    const printed = BOARD.spaces[id];
    state.board[id] = {
      roomCard: rooms[i] || "corridor",
      revealed: false,
      red: printed.red,
      yellow: printed.yellow,
    };
  }
  for (const [cid, loc] of Object.entries(BOARD.catSpawns)) {
    const cat = state.cats.find((c) => c.id === cid);
    if (cat) cat.loc = loc;
  }
  for (const p of state.players) p.loc = BOARD.startId;
  state.phase = "play";
  state.round = 1;
  state.turnSeat = state.firstSeat;
  log(state, "The den is stocked. Thieves, begin.");
  beginTurn(state);
}

function createMatch({ id, name, seats, rngSeed }) {
  const rng = typeof rngSeed === "function" ? rngSeed : mulberry(rngSeed || Date.now());
  const players = seats.map((s) => ({
    seat: s.seat,
    id: s.playerId,
    name: s.name,
    isAI: !!s.isAI,
    characterId: null,
    hp: 0,
    maxHp: 0,
    loc: BOARD.startId,
    lastRoom: null,
    lastRoomLeft: null,
    hand: [],
    status: "active",
    barbIgnoreRound: -1,
    escapeOrder: null,
  }));

  const state = {
    id,
    name,
    phase: "first",
    players,
    cats: [
      { id: "angel", name: "Nox", loc: BOARD.catSpawns.angel, role: "A" },
      { id: "alex", name: "Griselbrand", loc: BOARD.catSpawns.alex, role: "B" },
      { id: "lily", name: "Dazzler", loc: BOARD.catSpawns.lily, role: "C" },
    ],
    board: {},
    decks: {
      denizens: shuffle(rng, DENIZEN_CARDS.map((c) => c.id)),
      denizenDiscard: [],
      loot: shuffle(rng, LOOT_CARDS.map((c) => c.id)),
      lootDiscard: [],
    },
    treasurePile: [],
    turnSeat: 0,
    firstSeat: 0,
    pickSeat: 0,
    round: 1,
    turn: null,
    prompt: null,
    reaction: null,
    lastDie: null,
    combatMods: {},
    dragonPenalty: 0,
    log: [],
    winners: null,
    escapeCount: 0,
    nextUid: 1,
    turnSeq: 0,
    discardQueue: [],
    noticeQueue: [],
    pendingPass: null,
  };
  // bind rng without serializing the function on clones we send
  Object.defineProperty(state, "rng", { value: rng, enumerable: false, writable: true });

  const dragons = players.filter((p) => String(p.name).toLowerCase() === "dragon");
  if (dragons.length) {
    const first = pick(rng, dragons);
    log(state, `${first.name} goes first (by ancient privilege).`);
    startPicking(state, first.seat);
  } else {
    setPrompt(state, {
      type: "petCat",
      seat: null,
      text: "Who most recently pet a cat? Claim first player.",
      endsAt: Date.now() + PET_MS,
    });
  }
  return state;
}

function applyAction(state, actorId, action) {
  if (state.phase === "end") return { ok: false, error: "Game over." };
  const actor = playerById(state, actorId);
  if (!actor) return { ok: false, error: "Not in this game." };

  if (action.type === "react") {
    return applyReact(state, actor, action);
  }

  if (state.reaction) return { ok: false, error: "A reaction is live." };

  if (action.type === "continue") {
    if (state.prompt?.type === "roomReveal") {
      applyRoomReveal(state);
      return { ok: true };
    }
    if (state.prompt?.type === "denizenReveal") {
      finishDenizenReveal(state);
      return { ok: true };
    }
    if (state.prompt?.type === "combatResult") {
      finishCombatResult(state);
      return { ok: true };
    }
    if (state.prompt?.type === "lootResult") {
      finishLootResult(state);
      return { ok: true };
    }
    if (state.prompt?.type === "raceResult") {
      finishRaceResult(state);
      return { ok: true };
    }
    if (state.prompt?.type === "combatBoost") {
      applyCombatOutcome(state);
      return { ok: true };
    }
    return { ok: false, error: "Nothing to continue." };
  }

  if (state.prompt?.type === "diceWait" || state.prompt?.type === "combatPause" || state.prompt?.type === "combatResult" || state.prompt?.type === "lootResult" || state.prompt?.type === "raceResult" || state.prompt?.type === "roomReveal" || state.prompt?.type === "denizenReveal" || state.prompt?.type === "walkWait" || state.prompt?.type === "catAnnounce" || state.prompt?.type === "fightAnnounce" || state.prompt?.type === "turnAnnounce" || state.prompt?.type === "deathAnnounce") {
    return { ok: false, error: "Wait for it." };
  }

  const prompt = state.prompt;
  if (prompt?.type === "petCat") {
    if (action.type !== "claimPetCat") return { ok: false, error: "Claim first player." };
    if (actor.isAI) return { ok: false, error: "AI does not pet cats (citation needed)." };
    log(state, `${actor.name} most recently pet a cat.`);
    startPicking(state, actor.seat);
    return { ok: true };
  }

  if (prompt && prompt.seat != null && prompt.seat !== actor.seat && !["playScroll"].includes(action.type)) {
    return { ok: false, error: "Not your prompt." };
  }

  switch (action.type) {
    case "pickCharacter":
      if (prompt?.type !== "pickCharacter") return { ok: false, error: "Not picking." };
      return assignCharacter(state, actor, action.characterId);
    case "rollMove": {
      if (prompt?.type !== "preMove") return { ok: false, error: "Can't roll now." };
      doMoveRoll(state, actor);
      return { ok: true };
    }
    case "move": {
      if (prompt?.type !== "move") return { ok: false, error: "Not moving." };
      return doPlayerMove(state, actor, action.spaceId);
    }
    case "catPick": {
      if (prompt?.type !== "catPick") return { ok: false, error: "No cat pick." };
      return startCatMove(state, actor, action.catId);
    }
    case "catMove":
    case "doubleCat": {
      if (prompt?.type !== "catMove" && prompt?.type !== "doubleCat") return { ok: false, error: "No cat move." };
      const cat = state.cats.find((c) => c.id === (prompt.catId || state.turn.catId));
      const walked = walkCatTo(state, cat, action.spaceId, state.turn.catSteps);
      if (!walked.ok) return walked;
      state.turn.catSteps = walked.left;
      if (prompt.type === "doubleCat") {
        holdWalk(state, () => {
          if (walked.hit || state.turn.catSteps <= 0) {
            finishDoubleCat(state);
            return;
          }
          const opts = catDestOptions(state, cat, state.turn.catSteps);
          if (!opts.length) finishDoubleCat(state);
          else {
            setPrompt(state, {
              type: "doubleCat",
              seat: actor.seat,
              catId: cat.id,
              text: `DOUBLE! Move ${cat.name} ${state.turn.catSteps} left. Click any highlighted space.`,
              options: opts,
            });
          }
        });
        return { ok: true };
      }
      holdWalk(state, () => {
        if (walked.hit || state.turn.catSteps <= 0) applyEndOfTurn(state, actor);
        else promptCatStep(state, actor, cat, false);
      });
      return { ok: true };
    }
    case "chooseStat": {
      if (prompt?.type !== "chooseStat") return { ok: false, error: "No stat choice." };
      if (!["might", "guile"].includes(action.stat)) return { ok: false, error: "Might or Guile." };
      state.turn.combat.use = action.stat;
      offerCombat(state, actor);
      return { ok: true };
    }
    case "resolveCombat": {
      if (prompt?.type !== "combat" && prompt?.type !== "dragon") return { ok: false, error: "Not in combat." };
      resolveCombat(state, actor, action.auto);
      return { ok: true };
    }
    case "resolveDragon": {
      if (prompt?.type !== "dragon" && !(prompt?.type === "combat" && isDragonCombat(state))) return { ok: false, error: "No dragon." };
      resolveDragon(state, actor);
      return { ok: true };
    }
    case "sacrificeLoot": {
      if (prompt?.type !== "combat" && prompt?.type !== "dragon") return { ok: false, error: "Not fighting." };
      if (!isDragonCombat(state) || state.turn?.combat?.rolling) return { ok: false, error: "Too late to sacrifice." };
      const card = takeCard(actor.hand, action.uid);
      if (!card) return { ok: false, error: "Choose loot to sacrifice." };
      state.treasurePile.push(card);
      state.dragonPenalty = (state.dragonPenalty || 0) + 1;
      log(state, `${actor.name} sacrifices ${lootDef(card.defId).name}. The Dragon's score is permanently −1.`, actor.seat);
      offerCombat(state, actor);
      return { ok: true };
    }
    case "spendCombatHp": {
      if (prompt?.type !== "combatBoost") return { ok: false, error: "Not now." };
      return spendCombatHp(state, actor, action.n);
    }
    case "discardEnc":
    case "overCarry":
    case "discardItem": {
      const card = takeCard(actor.hand, action.uid);
      if (!card) return { ok: false, error: "Choose a card in hand." };
      if (prompt?.type === "discardItem" && (prompt.kind === "Item" || prompt.kind === "Treasure") && !isTreasure(card.defId)) {
        actor.hand.push(card);
        return { ok: false, error: "Discard a treasure item." };
      }
      state.treasurePile.push(card);
      log(state, `${actor.name} discards ${lootDef(card.defId).name}.`, actor.seat);
      if (prompt?.type === "discardItem") {
        enqueueNotice(state, {
          seat: actor.seat,
          kind: "loss",
          title: "Discarded!",
          text: prompt.why || `${actor.name} discards ${lootDef(card.defId).name}.`,
          cards: [card],
        });
      }
      if (prompt?.type === "discardEnc" || prompt?.type === "overCarry") enforceCarry(state, actor);
      else {
        if (state.discardQueue?.length) state.discardQueue.shift();
        if (flushNotices(state)) return { ok: true };
        if (!flushDiscardQueue(state)) {
          if (state._afterDiscard) {
            const saved = state._afterDiscard;
            state._afterDiscard = null;
            setPrompt(state, saved);
          } else restoreOrPreMove(state);
        }
      }
      return { ok: true };
    }
    case "passTreasure": {
      if (prompt?.type !== "passTreasure") return { ok: false, error: "Not passing." };
      const card = actor.hand.find((c) => c.uid === action.uid && isTreasure(c.defId));
      if (!card) return { ok: false, error: "Pick a treasure." };
      state.pendingPass.picks[actor.seat] = card.uid;
      state.pendingPass.remaining.shift();
      askPass(state);
      return { ok: true };
    }
    case "yoinkPick": {
      if (prompt?.type !== "yoinkPick") return { ok: false, error: "Not stealing." };
      const from = playerBySeat(state, prompt.fromSeat);
      const card = takeCard(from.hand, action.uid);
      if (!card) return { ok: false, error: "That card is gone." };
      actor.hand.push(card);
      log(state, `${actor.name} yoinks ${lootDef(card.defId).name} from ${from.name}.`);
      enqueueNotice(state, {
        seat: actor.seat,
        kind: "gain",
        title: "Yoink!",
        text: `${actor.name} steals ${lootDef(card.defId).name} from ${from.name}.`,
        cards: [card],
      });
      if (!flushNotices(state)) restoreOrPreMove(state);
      return { ok: true };
    }
    case "kittyPick": {
      if (prompt?.type !== "kittyPick") return { ok: false, error: "Pick a cat." };
      const cat = state.cats.find((c) => c.id === action.catId);
      if (!cat) return { ok: false, error: "Which cat?" };
      const left = 6;
      state.turn._kitty = { catId: cat.id, left, saved: prompt.saved };
      setPrompt(state, {
        type: "kittyMove",
        seat: actor.seat,
        catId: cat.id,
        text: `Move ${cat.name} up to ${left} spaces (or stop). Click any highlighted space.`,
        options: catDestOptions(state, cat, left),
        canStop: true,
      });
      return { ok: true };
    }
    case "kittyMove": {
      if (prompt?.type !== "kittyMove") return { ok: false, error: "Not moving a cat." };
      if (action.stop) {
        restoreOrPreMove(state);
        return { ok: true };
      }
      const kit = state.turn && state.turn._kitty;
      if (!kit) {
        restoreOrPreMove(state);
        return { ok: true };
      }
      const cat = state.cats.find((c) => c.id === prompt.catId);
      const walked = walkCatTo(state, cat, action.spaceId, kit.left);
      if (!walked.ok) return walked;
      kit.left = walked.left;
      holdWalk(state, () => {
        const left = state.turn && state.turn._kitty ? state.turn._kitty.left : 0;
        if (walked.hit || left <= 0) {
          restoreOrPreMove(state);
          return;
        }
        setPrompt(state, {
          type: "kittyMove",
          seat: actor.seat,
          catId: cat.id,
          text: `Move ${cat.name}: ${left} left (or stop). Click any highlighted space.`,
          options: catDestOptions(state, cat, left),
          canStop: true,
        });
      });
      return { ok: true };
    }
    case "playScroll": {
      const fromOver = prompt?.type === "overCarry";
      const res = playScroll(state, actor, action.uid, action);
      if (res.ok && fromOver) {
        if (res.replacePrompt || res.pending) state.pendingCarrySeat = actor.seat;
        else {
          if (flushNotices(state)) {
            state.pendingCarrySeat = actor.seat;
            return res;
          }
          enforceCarry(state, actor);
        }
        return res;
      }
      if (res.ok && !res.replacePrompt && !res.pending) {
        if (flushNotices(state)) return res;
        if (!flushDiscardQueue(state) && state.prompt?.type === "preMove") offerPreMove(state, playerBySeat(state, state.turnSeat));
        else if ((state.prompt?.type === "combat" || state.prompt?.type === "dragon") && state.turn?.combat) {
          offerCombat(state, playerBySeat(state, state.turnSeat));
        }
      }
      return res;
    }
    default:
      return { ok: false, error: `Unknown action ${action.type}` };
  }
}

function stepCatAfter(state, actor, r) {
  state.turn.catSteps -= 1;
  const cat = state.cats.find((c) => c.id === state.turn.catId);
  if (r === "hit" || state.turn.catSteps <= 0) {
    applyEndOfTurn(state, actor);
    return { ok: true };
  }
  promptCatStep(state, actor, cat, false);
  return { ok: true };
}

function applyReact(state, actor, action) {
  const r = state.reaction;
  if (!r) return { ok: false, error: "Nothing to react to." };
  if (action.react === "double") {
    if (r.type !== "double") return { ok: false, error: "No DOUBLE window." };
    return recordRaceClick(state, actor);
  }
  if (action.react === "cup") {
    if (r.type !== "cup") return { ok: false, error: "No cup." };
    return recordRaceClick(state, actor);
  }
  if (action.react === "who") {
    if (r.type !== "who") return { ok: false, error: "No naming window." };
    if (action.targetSeat === r.casterSeat) return { ok: false, error: "Not the caster." };
    const named = playerBySeat(state, action.targetSeat);
    if (!named || named.status !== "active") return { ok: false, error: "They're out of the den." };
    resolveWho(state, action.targetSeat);
    return { ok: true };
  }
  if (action.react === "fork") {
    if (r.type !== "fork" || actor.seat !== r.targetSeat) return { ok: false, error: "Not your fork." };
    const fork = actor.hand.find((c) => c.defId === "fork");
    if (!fork) return { ok: false, error: "No fork scroll." };
    takeCard(actor.hand, fork.uid);
    state.decks.lootDiscard.push("fork");
    log(state, `${actor.name} forks the spell back!`);
    const orig = r.original;
    clearReaction(state);
    const caster = playerBySeat(state, orig.casterSeat);
    const copyExtra = { ...orig.extra, targetSeat: orig.casterSeat };
    applyScroll(state, actor, orig.defId, copyExtra);
    const card = caster.hand.find((c) => c.uid === orig.cardUid);
    if (caster && card) resolveScrollPlay(state, caster, card, orig.extra, { skipFork: true });
    return { ok: true };
  }
  if (action.react === "declineFork") {
    if (r.type !== "fork" || actor.seat !== r.targetSeat) return { ok: false, error: "No." };
    const orig = r.original;
    clearReaction(state);
    const caster = playerBySeat(state, orig.casterSeat);
    const card = caster.hand.find((c) => c.uid === orig.cardUid);
    if (caster && card) resolveScrollPlay(state, caster, card, orig.extra, { skipFork: true });
    return { ok: true };
  }
  return { ok: false, error: "Bad react." };
}

function legalActions(state, actorId) {
  const actor = playerById(state, actorId);
  if (!actor) return [];
  const acts = [];
  if (state.reaction) {
    const r = state.reaction;
    if (r.type === "double" && actor.status === "active" && (r.clicks == null || r.clicks[actor.seat] == null)) acts.push({ type: "react", react: "double" });
    if (r.type === "cup" && actor.status === "active" && (r.clicks == null || r.clicks[actor.seat] == null)) acts.push({ type: "react", react: "cup" });
    if (r.type === "who") {
      for (const o of activePlayers(state)) {
        if (o.seat === r.casterSeat) continue;
        acts.push({ type: "react", react: "who", targetSeat: o.seat });
      }
    }
    if (r.type === "fork" && actor.seat === r.targetSeat) {
      acts.push({ type: "react", react: "fork" });
      acts.push({ type: "react", react: "declineFork" });
    }
    return acts;
  }
  const pr = state.prompt;
  if (!pr) return [];
  if (pr.type === "petCat" && !actor.isAI) {
    acts.push({ type: "claimPetCat" });
    return acts;
  }
  if (pr.seat != null && pr.seat !== actor.seat) return acts;

  switch (pr.type) {
    case "pickCharacter":
      for (const id of pr.options) acts.push({ type: "pickCharacter", characterId: id });
      break;
    case "preMove":
      acts.push({ type: "rollMove" });
      for (const c of scrolls(actor.hand)) {
        if (!scrollLegalNow(state, actor, c.defId)) continue;
        acts.push({ type: "playScroll", uid: c.uid, defId: c.defId });
      }
      break;
    case "move":
      for (const id of pr.options) acts.push({ type: "move", spaceId: id });
      break;
    case "catPick":
      for (const id of pr.cats) acts.push({ type: "catPick", catId: id });
      break;
    case "catMove":
    case "doubleCat":
    case "kittyMove":
      for (const id of pr.options || []) acts.push({ type: pr.type === "kittyMove" ? "kittyMove" : pr.type === "doubleCat" ? "doubleCat" : "catMove", spaceId: id });
      if (pr.canStop) acts.push({ type: "kittyMove", stop: true });
      break;
    case "kittyPick":
      for (const c of state.cats) acts.push({ type: "kittyPick", catId: c.id });
      break;
    case "walkWait":
    case "catAnnounce":
    case "fightAnnounce":
    case "turnAnnounce":
    case "deathAnnounce":
      break;
    case "chooseStat":
      acts.push({ type: "chooseStat", stat: "might" }, { type: "chooseStat", stat: "guile" });
      break;
    case "roomReveal":
    case "denizenReveal":
    case "lootResult":
    case "combatResult":
      if (actor.status === "active") acts.push({ type: "continue" });
      break;
    case "raceResult":
      if (actor.status === "active" && !actor.isAI) acts.push({ type: "continue" });
      break;
    case "combatBoost":
      if (pr.need && pr.hp > pr.need) acts.push({ type: "spendCombatHp", n: pr.need });
      acts.push({ type: "continue" });
      break;
    case "combat":
      acts.push({ type: "resolveCombat", auto: combatOutlook(state, actor) || undefined });
      for (const c of scrolls(actor.hand)) {
        if (scrollLegalNow(state, actor, c.defId)) acts.push({ type: "playScroll", uid: c.uid, defId: c.defId });
      }
      if (isDragonCombat(state) && !state.turn?.combat?.rolling) {
        for (const c of actor.hand) acts.push({ type: "sacrificeLoot", uid: c.uid });
      }
      break;
    case "dragon":
      acts.push({ type: "resolveCombat", auto: combatOutlook(state, actor) || undefined });
      for (const c of scrolls(actor.hand)) {
        if (scrollLegalNow(state, actor, c.defId)) acts.push({ type: "playScroll", uid: c.uid, defId: c.defId });
      }
      if (isDragonCombat(state) && !state.turn?.combat?.rolling) {
        for (const c of actor.hand) acts.push({ type: "sacrificeLoot", uid: c.uid });
      }
      break;
    case "discardEnc":
    case "overCarry":
    case "discardItem":
      for (const c of actor.hand) {
        if (pr.type === "discardItem" && (pr.kind === "Item" || pr.kind === "Treasure") && !isTreasure(c.defId)) continue;
        acts.push({ type: pr.type === "overCarry" ? "overCarry" : pr.type, uid: c.uid });
        if (pr.type === "overCarry" && isScroll(c.defId) && lootDef(c.defId).timing !== "fork") {
          acts.push({ type: "playScroll", uid: c.uid, defId: c.defId });
        }
      }
      break;
    case "passTreasure":
      for (const c of treasures(actor.hand)) acts.push({ type: "passTreasure", uid: c.uid });
      break;
    case "yoinkPick": {
      const from = playerBySeat(state, pr.fromSeat);
      for (const c of from.hand) acts.push({ type: "yoinkPick", uid: c.uid });
      break;
    }
    default:
      break;
  }
  return acts;
}

function publicState(state, viewerId) {
  const viewer = playerById(state, viewerId);
  const players = state.players.map((p) => {
    const mine = p.id === viewerId;
    return {
      seat: p.seat,
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      characterId: p.characterId,
      hp: p.hp,
      maxHp: p.maxHp,
      might: p.characterId ? mightOf(state, p) : null,
      guile: p.characterId ? guileOf(state, p) : null,
      strength: p.characterId ? strengthOf(p) : null,
      loc: p.loc,
      status: p.status,
      enc: encOf(p.hand),
      value: mine || state.phase === "end" ? valueOf(p.hand) : null,
      handCount: p.hand.length,
      handOutlines: p.hand.map((c) => ({
        kind: isScroll(c.defId) ? "scroll" : "treasure",
        uid: c.uid,
      })),
      peekHand: p.hand.map((c) => ({ uid: c.uid, defId: c.defId, ...lootDef(c.defId) })),
      hand: mine ? p.hand.map((c) => ({ uid: c.uid, defId: c.defId, ...lootDef(c.defId) })) : null,
      escapeOrder: p.escapeOrder,
    };
  });
  const board = {};
  for (const [id, cell] of Object.entries(state.board)) {
    board[id] = {
      revealed: cell.revealed,
      red: cell.red,
      yellow: cell.yellow,
      roomCard: cell.revealed ? cell.roomCard : null,
      room: cell.revealed ? { ...roomDef(cell.roomCard), art: `/assets/rooms/${cell.roomCard}.png` } : null,
    };
  }
  let prompt = state.prompt ? clone(state.prompt) : null;
  if (prompt?.type === "yoinkPick" && viewer?.seat === prompt.seat) {
    const from = playerBySeat(state, prompt.fromSeat);
    prompt.cards = from.hand.map((c) => ({ uid: c.uid, defId: c.defId, ...lootDef(c.defId) }));
  }
  return {
    id: state.id,
    name: state.name,
    phase: state.phase,
    round: state.round,
    turnSeat: state.turnSeat,
    firstSeat: state.firstSeat,
    players,
    cats: state.cats,
    board,
    spaces: Object.fromEntries(
      Object.values(BOARD.spaces).map((s) => [s.id, { id: s.id, x: s.x, y: s.y, type: s.type, next: s.next }])
    ),
    props: BOARD.props || [],
    treasureCount: state.treasurePile.length,
    lootDeck: state.decks.loot.length,
    denizenDeck: state.decks.denizens.length,
    turn: state.turn && {
      phase: state.turn.phase,
      stepsLeft: state.turn.stepsLeft,
      primaryDie: state.turn.primaryDie,
      moveDice: state.turn.moveDice,
      haste: state.turn.haste,
      combat: state.turn.combat,
    },
    prompt,
    reaction: state.reaction
      ? {
          type: state.reaction.type,
          endsAt: state.reaction.endsAt,
          text: state.reaction.text,
          casterSeat: state.reaction.casterSeat,
          targetSeat: state.reaction.targetSeat,
          lastSeat: state.reaction.lastSeat,
          number: state.reaction.number,
          spot: state.reaction.spot,
          startedAt: state.reaction.startedAt,
          clicks: state.reaction.clicks || {},
        }
      : null,
    diceFx: state.diceFx
      ? { seq: state.diceFx.seq, faces: state.diceFx.faces.slice(), reason: state.diceFx.reason, endsAt: state.diceFx.endsAt }
      : null,
    walkFx: state.walkFx
      ? { seq: state.walkFx.seq, token: state.walkFx.token, path: state.walkFx.path.slice() }
      : null,
    log: state.log.slice(-40),
    turnSeq: state.turnSeq || 0,
    winners: state.winners,
    viewerSeat: viewer?.seat ?? null,
    characters: CHARACTERS,
    now: Date.now(),
  };
}

module.exports = {
  createMatch,
  applyAction,
  legalActions,
  publicState,
  tick,
  CHARACTERS,
  BOARD,
};
