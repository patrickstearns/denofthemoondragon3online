(() => {
  const socket = io();
  const app = document.getElementById("app");

  const state = {
    screen: "title",
    name: localStorage.getItem("dd3-name") || "",
    playerId: localStorage.getItem("dd3-id") || "",
    lobby: { players: [], games: { waiting: [], active: [] } },
    room: null,
    game: null,
    error: "",
    targeting: null,
    lastTurnSeq: 0,
    turnBannerTimer: null,
    revealKey: "",
    resultKey: "",
    resultPending: "",
    resultTimer: null,
    raceKey: "",
    logKey: "",
    scoreAnimKey: "",
    chitCounts: {},
    chitReady: false,
    lastChitFxMs: 0,
    lastWalkSeq: 0,
    walkBusy: false,
    walkToken: "",
    walkTimer: null,
    boardPromptKey: "",
    boardPromptWait: null,
    turnBannerUntil: 0,
    hpShown: {},
    handView: null,
    handViewKey: "",
    handHoverTimer: null,
  };

  const CHAR_COLOR = {
    cleric: "#e8d48b",
    wizard: "#7ec8e3",
    rogue: "#9ad89a",
    barbarian: "#e07a5f",
  };
  const DIE_ROT = {
    1: [0, 0],
    2: [90, 0],
    3: [0, -90],
    4: [0, 90],
    5: [-90, 0],
    6: [0, 180],
  };
  const PIP_CELLS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  function svgArt(inner) {
    return `<svg class="loot-svg" viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  function lootArt(id) {
    const bags = (n) => {
      const parts = [];
      const start = 32 - (n - 1) * 10;
      for (let i = 0; i < n; i++) {
        const x = start + i * 20;
        parts.push(`<path d="M${x - 7} 22c0-4 3-7 7-7s7 3 7 7"/><path d="M${x - 8} 22h16l-2 16H${x - 6}z"/><path d="M${x - 3} 15h6"/>`);
      }
      return svgArt(parts.join(""));
    };
    switch (id) {
      case "gold1": return bags(1);
      case "gold2": return bags(2);
      case "gold3": return bags(3);
      case "chalice":
        return svgArt(`<path d="M22 10h20v6c0 8-6 12-10 14v6h8M32 30v6M22 42h20"/><path d="M24 10v4c0 6 4 10 8 10s8-4 8-10v-4"/>`);
      case "jewel_chalice":
        return svgArt(`<path d="M22 12h20v5c0 8-6 12-10 14v5h8M32 31v5M22 42h20"/><path d="M32 6l4 6h-8z"/><path d="M24 12v4c0 6 4 9 8 9s8-3 8-9v-4"/>`);
      case "pimp_cup":
        return svgArt(`<path d="M20 12h24l-2 8c-1 8-7 12-10 13v5h10M32 33v5M20 42h24"/><path d="M32 7l2 4 4 .4-3 3 .8 4L32 16l-3.8 2.4.8-4-3-3 4-.4z"/>`);
      case "music_box":
        return svgArt(`<rect x="14" y="18" width="28" height="20" rx="2"/><path d="M18 18v-4h8v4M38 12c4 2 4 8 0 10"/><circle cx="36" cy="14" r="2.2"/><path d="M42 10l4-4M48 12v-6"/>`);
      case "sword":
        return svgArt(`<path d="M32 6l4 6v22l-4 8-4-8V12z"/><path d="M22 20h20"/><path d="M32 34v8"/>`);
      case "bishop_ring":
        return svgArt(`<ellipse cx="32" cy="28" rx="14" ry="8"/><ellipse cx="32" cy="28" rx="8" ry="4.5"/><path d="M32 12l3 8h-6z"/>`);
      case "cardinal_ring":
        return svgArt(`<ellipse cx="32" cy="29" rx="15" ry="8"/><ellipse cx="32" cy="29" rx="8" ry="4.5"/><path d="M32 8l4 10H28z"/><path d="M26 18h12"/>`);
      case "horse":
        return svgArt(`<path d="M18 36v-8l6-6 4-12 6 4 8 2 4 8-6 4v8"/><path d="M28 18l-6-8M42 22l8-4"/><circle cx="36" cy="16" r="1.2" fill="currentColor"/>`);
      case "munchies":
        return svgArt(`<path d="M20 28c0-10 24-10 24 0 0 8-6 14-12 14s-12-6-12-14z"/><path d="M26 24c2-8 10-8 12 0"/>`);
      case "nectar":
        return svgArt(`<path d="M26 8h12l4 12v18a8 8 0 0 1-16 0V20z"/><path d="M28 20h12"/>`);
      case "yoink":
        return svgArt(`<path d="M18 30h16l6-10 8 4"/><path d="M34 20l8-8 6 4-6 8"/><path d="M20 30v10h12"/>`);
      case "trashing":
      case "scrapping":
        return svgArt(`<path d="M22 16h20l-2 24H24z"/><path d="M20 16h24M28 16V12h8v4M26 24v10M32 24v10M38 24v10"/>`);
      case "over_there":
        return svgArt(`<circle cx="22" cy="24" r="8"/><path d="M30 24h16m0 0-6-6m6 6-6 6"/>`);
      case "fork":
        return svgArt(`<path d="M20 40V18h6v22M38 40V18h6v22M26 22c0 8 12 8 12 0"/>`);
      case "fog":
        return svgArt(`<path d="M12 28c4-8 12-8 16-2 3-8 14-10 20-2 6 0 8 6 6 10H14c-4 0-6-4-2-6z"/><path d="M18 36h28"/>`);
      case "who_wants":
        return svgArt(`<circle cx="32" cy="18" r="8"/><path d="M20 40c2-10 22-10 24 0"/><path d="M44 12l8-6"/>`);
      case "kitty":
        return svgArt(`<path d="M20 30c0-10 8-16 12-16s12 6 12 16-8 14-12 14-12-4-12-14z"/><path d="M24 16l-4-10 10 6M40 16l4-10-10 6"/><circle cx="26" cy="28" r="1.2" fill="currentColor"/><circle cx="38" cy="28" r="1.2" fill="currentColor"/>`);
      case "in_the_cup":
        return svgArt(`<path d="M18 14h28v8c0 10-8 16-14 16s-14-6-14-16z"/><path d="M32 38v6M22 44h20"/>`);
      case "peace":
        return svgArt(`<path d="M32 8c10 8 14 18 14 26 0 8-6 10-14 10S18 42 18 34c0-8 4-18 14-26z"/><path d="M32 18v16M24 28h16"/>`);
      case "war":
        return svgArt(`<path d="M16 36l8-20 8 12 8-12 8 20"/><path d="M20 36h24"/>`);
      case "redistribute":
        return svgArt(`<circle cx="32" cy="24" r="14"/><path d="M32 10v28M18 24h28"/><path d="M22 16l20 16M42 16 22 32"/>`);
      case "impede":
        return svgArt(`<path d="M16 24h20"/><path d="M36 18l8 6-8 6"/><path d="M20 14v20"/>`);
      case "haste":
        return svgArt(`<path d="M36 6L22 24h12L26 42l18-22H32z"/>`);
      case "empty":
        return svgArt(`<rect x="16" y="14" width="32" height="24" rx="2"/><path d="M22 22h20M22 28h14"/>`);
      case "missed":
        return svgArt(`<rect x="16" y="14" width="32" height="24" rx="2"/><path d="M32 20v12M26 26h12"/><path d="M44 12l6-6"/>`);
      case "everyone":
        return svgArt(`<circle cx="20" cy="20" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="32" cy="32" r="6"/><path d="M20 40h24"/>`);
      case "destrong":
        return svgArt(`<path d="M24 40V16h6l8 10V16h6v24h-6l-8-10v10z"/><path d="M18 12l28 28"/>`);
      case "desmart":
        return svgArt(`<circle cx="32" cy="22" r="10"/><path d="M32 32v10M24 42h16"/><path d="M20 14l24 24"/>`);
      case "enstrong":
        return svgArt(`<path d="M24 40V16h6l8 10V16h6v24h-6l-8-10v10z"/><path d="M32 6v6M32 6l-4 4M32 6l4 4"/>`);
      case "ensmart":
        return svgArt(`<circle cx="32" cy="22" r="10"/><path d="M32 32v10M24 42h16"/><path d="M32 6v6M32 6l-4 4M32 6l4 4"/>`);
      default:
        return svgArt(`<rect x="16" y="10" width="32" height="28" rx="2"/><path d="M16 16h32"/>`);
    }
  }

  function emit(ev, payload) {
    socket.emit(ev, payload);
  }

  function setError(msg) {
    state.error = msg || "";
    if (msg) setTimeout(() => { if (state.error === msg) { state.error = ""; render(); } }, 3500);
    render();
  }

  socket.on("auth:ok", ({ playerId, name }) => {
    state.playerId = playerId;
    state.name = name;
    localStorage.setItem("dd3-id", playerId);
    localStorage.setItem("dd3-name", name);
    state.screen = "lobby";
    render();
  });
  socket.on("auth:error", ({ error }) => setError(error));
  socket.on("lobby:state", (lobby) => {
    state.lobby = lobby;
    if (state.screen === "lobby") render();
  });
  socket.on("game:joined", ({ room }) => {
    state.room = room;
    state.screen = room.status === "lobby" ? "gameLobby" : "table";
    render();
  });
  socket.on("game:lobby", ({ room }) => {
    if (!state.room || state.room.id !== room.id) return;
    state.room = { ...room, id: room.id };
    if (state.screen === "gameLobby") render();
  });
  socket.on("game:state", (game) => {
    state.game = game;
    state.screen = "table";
    state.room = state.room || { id: game.id };
    if (document.getElementById("tableRoot")) patchTable(game);
    else render();
  });
  socket.on("game:error", ({ error }) => setError(error));

  function act(action) {
    emit("game:action", { gameId: (state.game && state.game.id) || (state.room && state.room.id), action });
  }

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function render() {
    const keepTable = state.screen === "table" && document.getElementById("tableRoot") && state.game;
    if (keepTable) {
      patchTable(state.game);
    } else {
      app.innerHTML = "";
      if (state.screen === "title") app.appendChild(viewTitle());
      else if (state.screen === "lobby") app.appendChild(viewLobby());
      else if (state.screen === "gameLobby") app.appendChild(viewGameLobby());
      else app.appendChild(viewTable());
    }
    const oldToast = document.querySelector(".toast");
    if (oldToast) oldToast.remove();
    if (state.error) app.appendChild(el(`<div class="toast">${esc(state.error)}</div>`));
    syncGear();
  }

  function returnToLobby() {
    const gameId = (state.game && state.game.id) || (state.room && state.room.id);
    if (gameId) emit("game:leave", { gameId });
    state.game = null;
    state.room = null;
    state.screen = "lobby";
    state.revealKey = "";
    state.logKey = "";
    state.targeting = null;
    state.handView = null;
    state.handViewKey = "";
    closeGear();
    render();
  }

  function closeGear() {
    const menu = document.getElementById("gearMenu");
    const btn = document.getElementById("gearBtn");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function syncGear() {
    const show = state.screen === "table" || state.screen === "gameLobby";
    let wrap = document.getElementById("gearWrap");
    if (!show) {
      if (wrap) wrap.remove();
      return;
    }
    if (wrap) return;
    wrap = el(`<div class="gear-wrap" id="gearWrap">
      <button class="gear-btn" id="gearBtn" type="button" aria-label="Menu" aria-expanded="false" aria-haspopup="true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.7.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.27.12.56.02.7-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>
      </button>
      <div class="gear-menu" id="gearMenu" hidden>
        <button type="button" id="returnLobby">Return to lobby</button>
      </div>
    </div>`);
    document.body.appendChild(wrap);
    wrap.querySelector("#gearBtn").onclick = (e) => {
      e.stopPropagation();
      const menu = wrap.querySelector("#gearMenu");
      const open = menu.hidden;
      menu.hidden = !open;
      wrap.querySelector("#gearBtn").setAttribute("aria-expanded", open ? "true" : "false");
    };
    wrap.querySelector("#returnLobby").onclick = (e) => {
      e.stopPropagation();
      returnToLobby();
    };
    wrap.onclick = (e) => e.stopPropagation();
  }

  if (!window.__dd3GearDoc) {
    window.__dd3GearDoc = true;
    document.addEventListener("click", closeGear);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function cardTextTip() {
    let tip = document.getElementById("cardTextTip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "cardTextTip";
      tip.className = "card-text-tip";
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  if (!window.__dd3CardTip) {
    window.__dd3CardTip = true;
    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest && e.target.closest("[data-full]");
      if (!el) return;
      const tip = cardTextTip();
      tip.textContent = el.getAttribute("data-full") || "";
      if (!tip.textContent) return;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const w = Math.min(320, window.innerWidth - 16);
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      let top = r.bottom + 8;
      tip.style.width = w + "px";
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = top + "px";
      const box = tip.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 8) {
        tip.style.top = Math.max(8, r.top - box.height - 8) + "px";
      }
    });
    document.addEventListener("pointerout", (e) => {
      const el = e.target.closest && e.target.closest("[data-full]");
      if (!el) return;
      const next = e.relatedTarget;
      if (next && (el.contains(next) || next === cardTextTip() || cardTextTip().contains(next))) return;
      cardTextTip().hidden = true;
    });
  }

  function viewTitle() {
    const root = el(`<div class="screen title-screen"><div class="center">
      <div class="splash-card">
        <form id="enter">
          <input id="nm" maxlength="24" placeholder="Your name" value="${esc(state.name)}" />
          <button class="primary" type="submit">Enter</button>
        </form>
      </div>
    </div></div>`);
    root.querySelector("#enter").onsubmit = (e) => {
      e.preventDefault();
      const name = root.querySelector("#nm").value.trim();
      if (!name) return setError("Name yourself, thief.");
      emit("auth:hello", { name, playerId: state.playerId });
    };
    return root;
  }

  function viewLobby() {
    const { players, games } = state.lobby;
    const wait = games.waiting || [];
    const active = games.active || [];
    const root = el(`<div class="screen">
      <div class="topbar">
        <h2>Den of the Moon Dragon III</h2>
        <div class="who">logged in as ${esc(state.name)}</div>
      </div>
      <div class="lobby">
        <div class="panel">
          <h2>In the lobby</h2>
          <ul class="list" id="plist"></ul>
        </div>
        <div>
          <div class="panel" style="margin-bottom:1rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h2>Open dens</h2>
              <button class="primary" id="create">Create game</button>
            </div>
            <div id="waiting"></div>
          </div>
          <div class="panel">
            <h2>Active games</h2>
            <div id="active"></div>
          </div>
        </div>
      </div>
    </div>`);
    const pl = root.querySelector("#plist");
    if (!players.length) pl.innerHTML = `<div class="empty">No one else is skulking yet.</div>`;
    players.forEach((p) => {
      pl.appendChild(el(`<li>
        <span>${esc(p.name)}${p.id === state.playerId ? " <em>you</em>" : ""}</span>
        <span class="geo">${esc(p.geo || "…")}</span>
      </li>`));
    });
    const w = root.querySelector("#waiting");
    if (!wait.length) w.innerHTML = `<div class="empty">No open games. Make one.</div>`;
    wait.forEach((g) => {
      const row = el(`<div class="game-row">
        <div><strong>${esc(g.name)}</strong><div class="muted">${g.playerCount} seated · ${esc(g.creator)}</div></div>
        <button data-id="${esc(g.id)}">Join</button>
      </div>`);
      row.querySelector("button").onclick = () => emit("game:join", { gameId: g.id });
      w.appendChild(row);
    });
    const a = root.querySelector("#active");
    if (!active.length) a.innerHTML = `<div class="empty">None in progress.</div>`;
    active.forEach((g) => {
      a.appendChild(el(`<div class="game-row"><div><strong>${esc(g.name)}</strong><div class="muted">${g.status}</div></div><span class="muted">In play</span></div>`));
    });
    root.querySelector("#create").onclick = () => emit("game:create");
    return root;
  }

  function viewGameLobby() {
    const room = state.room;
    const youCreator = room.creatorId === state.playerId;
    const root = el(`<div class="screen">
      <div class="topbar">
        <h2>${esc(room.name)}</h2>
        <div>
          <span class="who">${esc(state.name)}</span>
          <button id="leave" class="danger" style="margin-left:.6rem">Leave</button>
        </div>
      </div>
      <div class="center" style="align-items:stretch">
        <div style="width:min(960px,100%);padding:1rem">
          <div class="seats" id="seats"></div>
          <div style="margin-top:1.2rem;display:flex;gap:.6rem;justify-content:flex-end">
            ${youCreator ? `<button class="primary" id="start">Start</button>` : `<span class="muted">Waiting for the creator to start…</span>`}
          </div>
        </div>
      </div>
    </div>`);
    const box = root.querySelector("#seats");
    const modeLabel = { closed: "Closed", human: "Human", ai: "AI" };
    const modeCycle = { closed: "human", human: "ai", ai: "closed" };
    room.seats.forEach((s) => {
      const isYou = s.playerId === state.playerId;
      const canCycle = youCreator && s.index !== 0;
      const occupant = s.mode === "closed" ? "—" : (s.playerName || (s.mode === "human" ? "Empty" : "AI"));
      const card = el(`<div class="seat mode-${s.mode}${isYou ? " you" : ""}${canCycle ? " cycle" : ""}">
        <h3>Seat ${s.index + 1}</h3>
        <div class="seat-mode">${esc(modeLabel[s.mode] || s.mode)}</div>
        <div class="muted">${esc(occupant)}</div>
      </div>`);
      if (canCycle) {
        card.onclick = () => emit("game:setSeat", { gameId: room.id, seat: s.index, mode: modeCycle[s.mode] || "closed" });
      }
      if (s.mode === "human" && !s.playerId && !isYou) {
        const b = el(`<button style="margin-top:.4rem">Sit here</button>`);
        b.onclick = (e) => {
          e.stopPropagation();
          emit("game:sit", { gameId: room.id, seat: s.index });
        };
        card.appendChild(b);
      }
      box.appendChild(card);
    });
    root.querySelector("#leave").onclick = () => {
      emit("game:leave", { gameId: room.id });
      state.room = null;
      state.game = null;
      state.screen = "lobby";
      render();
    };
    const start = root.querySelector("#start");
    if (start) start.onclick = () => emit("game:start", { gameId: room.id });
    return root;
  }

  function portraitOf(g, characterId) {
    const ch = (g.characters || []).find((c) => c.id === characterId);
    return (ch && ch.portrait) || "";
  }

  function playerLabel(p, ch) {
    if (!p) return "someone";
    if (!p.isAI) return p.name;
    return (ch && ch.name) || p.name;
  }

  function actorName(g, seat) {
    const p = (g.players || []).find((x) => x.seat === seat);
    if (!p) return "someone";
    const ch = (g.characters || []).find((c) => c.id === p.characterId);
    return playerLabel(p, ch);
  }

  function waitingFor(g, seat, doing) {
    const name = actorName(g, seat);
    return doing ? `Waiting for ${name} to ${doing}…` : `Waiting for ${name}…`;
  }

  function isLivingHuman(p) {
    return !!(p && !p.isAI && p.status === "active");
  }

  function canDismissPrompt(me, pr) {
    if (!isLivingHuman(me) || !pr) return false;
    if (pr.type === "raceResult" || pr.catWound || pr.catDump || pr.catHit) return true;
    return pr.seat === me.seat;
  }

  function continueHtml(g, me, pr) {
    if (canDismissPrompt(me, pr)) {
      return `<button class="continue-reveal primary card-act" type="button">Continue</button>`;
    }
    if (me && me.status !== "active") return "";
    return `<p class="muted continue-reveal">${esc(waitingFor(g, pr.seat, "continue"))}</p>`;
  }

  function inTheDen(p) {
    return !!(p && p.status === "active");
  }

  function scrollTargetPlayers(g, me, card, kind) {
    const othersOnly = ["yoink", "trashing", "impede", "everyone"].includes(card && card.defId);
    return (g.players || []).filter((p) => {
      if (!inTheDen(p)) return false;
      if (kind === "who" && me && p.seat === me.seat) return false;
      if (othersOnly && me && p.seat === me.seat) return false;
      if (card && card.defId === "yoink" && !(p.handCount || (p.peekHand || p.hand || []).length)) return false;
      return true;
    });
  }

  function targetPlayerButton(g, p) {
    const ch = (g.characters || []).find((c) => c.id === p.characterId);
    const art = portraitOf(g, p.characterId);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "target-pick";
    b.innerHTML = `${art ? `<img class="portrait sm" src="${art}" alt="">` : ""}<span>${esc(playerLabel(p, ch))}</span>`;
    return b;
  }

  function mixHex(a, b, t) {
    const to = (h) => {
      const s = String(h || "").replace("#", "");
      if (s.length < 6) return [26, 18, 16];
      return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    };
    const A = to(a);
    const B = to(b);
    const m = A.map((v, i) => Math.round(v * (1 - t) + B[i] * t));
    return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
  }

  function panelStyle(ch, dead) {
    const c = (ch && (CHAR_COLOR[ch.id] || ch.color)) || "";
    if (!c) return dead ? "border-color:#6a645c;background:#1a1816;" : "";
    if (dead) {
      const muted = mixHex(c, "#6a645c", 0.75);
      const top = mixHex(c, "#2a2622", 0.88);
      const bot = mixHex(c, "#1a1816", 0.92);
      return `border-color:${muted};background:linear-gradient(180deg, ${top}, ${bot});`;
    }
    const top = mixHex(c, "#140f0c", 0.74);
    const bot = mixHex(c, "#0c0908", 0.86);
    return `border-color:${c};background:linear-gradient(180deg, ${top}, ${bot});`;
  }

  function playerHeading(p, ch) {
    const live = p.status === "active";
    return `<div class="player-name"><span class="status-dot ${live ? "on" : "off"}" title="${esc(live ? "Active" : p.status)}"></span><h3>${esc(playerLabel(p, ch))}</h3></div>`;
  }

  function iconHeart() {
    return `<svg class="icon-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S3 13.9 3 8.8C3 6 5.2 4 8 4c1.7 0 3.1.8 4 2 .9-1.2 2.3-2 4-2 2.8 0 5 2 5 4.8C21 13.9 12 21 12 21z"/></svg>`;
  }
  function iconFist() {
    return `<svg class="icon-stat icon-fist" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 10.8V6.6a1.35 1.35 0 0 1 2.7 0v3.6m0-2.8V5.4A1.3 1.3 0 0 1 13.3 5v5m0-3.2V5.8a1.3 1.3 0 1 1 2.6 0V12m.2-2.4c.1-.8.8-1.4 1.6-1.4.9 0 1.6.7 1.6 1.6v4.2c0 3.3-2.3 6-6.1 6H12c-2.7 0-5.2-1.3-6.3-3.8L4.2 13c-.5-.8-.2-1.8.6-2.3.8-.5 1.8-.2 2.3.6l.4.7 1.2-.2z"/></svg>`;
  }
  function iconSpark() {
    return `<svg class="icon-stat icon-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.4l2.4 6.6 6.6 2.4-6.6 2.4L12 19.4 9.6 12.8 3 10.4l6.6-2.4L12 1.4zm7.4 12.2 1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3 1.3-3.2zM3.8 3.2 5 6.2 8 7.4 5 8.6 3.8 11.6 2.6 8.6-.4 7.4 2.6 6.2 3.8 3.2z"/></svg>`;
  }
  function iconSack() {
    return `<svg class="icon-stat icon-sack" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 8.8C9.2 6.7 10.7 5 12.5 5s3.3 1.7 3.3 3.8h2.8c.6 0 1.1.5 1 1.1l-1.5 9.2c-.1.7-.7 1.2-1.4 1.2H8.3c-.7 0-1.3-.5-1.4-1.2L5.4 10c-.1-.6.3-1.1 1-1.2h2.8zm3.3-2.2c-1 0-1.8.8-1.8 2.2h3.6c0-1.4-.8-2.2-1.8-2.2z"/></svg>`;
  }

  function hpBar(p) {
    return `<div class="hp" data-hp-seat="${p.seat}"><span></span></div>`;
  }

  function animateHpBars(root) {
    if (!root || !state.game) return;
    state.hpShown = state.hpShown || {};
    root.querySelectorAll(".hp[data-hp-seat]").forEach((bar) => {
      const seat = bar.dataset.hpSeat;
      const p = state.game.players.find((x) => String(x.seat) === String(seat));
      if (!p) return;
      const pct = p.maxHp ? Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) : 0;
      const fill = bar.querySelector("span");
      if (!fill) return;
      const prev = state.hpShown[seat];
      const from = prev == null ? pct : prev;
      fill.style.transition = "none";
      fill.style.width = from + "%";
      bar.classList.remove("hurt", "heal");
      if (prev != null && pct < from - 0.2) bar.classList.add("hurt");
      if (prev != null && pct > from + 0.2) bar.classList.add("heal");
      state.hpShown[seat] = pct;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.transition = "";
          fill.style.width = pct + "%";
        });
      });
      const done = (ev) => {
        if (ev.propertyName && ev.propertyName !== "width") return;
        bar.classList.remove("hurt", "heal");
        bar.removeEventListener("transitionend", done);
      };
      bar.addEventListener("transitionend", done);
    });
  }

  function playerStats(p) {
    const n = p.handCount != null ? p.handCount : ((p.hand && p.hand.length) || 0);
    const cap = p.strength != null ? p.strength : "—";
    return `<div class="vitals">
      <span class="vital" title="Hit points">${iconHeart()}${p.hp}/${p.maxHp}</span>
      ${p.might != null ? `<span class="vital" title="Might">${iconFist()}<b>${p.might}</b></span>` : ""}
      ${p.guile != null ? `<span class="vital" title="Guile">${iconSpark()}<b>${p.guile}</b></span>` : ""}
      <span class="vital" title="Strength — max loot cards">${iconSack()}<b>${n}/${cap}</b></span>
    </div>`;
  }

  function viewTable() {
    const g = state.game;
    if (!g) return el(`<div class="screen"><div class="center">Loading the den…</div></div>`);
    const root = el(`<div class="screen table-layout" id="tableRoot">
      <div class="prompt-bar">
        <div class="text" id="promptText"></div>
        <div class="prompt-acts" id="promptActs"></div>
      </div>
      <div class="board-col">
        <div class="board-stage">
          <div class="board-wrap">
            <div class="board-sizer">
              <img src="/assets/DD3-Board.png" alt="Dragon's Den III board" />
              <div class="overlay" id="overlay"></div>
              <div class="fx-layer" id="fxLayer"></div>
              <div class="reveal-layer" id="revealLayer"></div>
              <div class="result-layer" id="resultLayer"></div>
              <div class="turn-layer" id="turnLayer"></div>
              <div class="prompt-layer" id="promptLayer"></div>
              <div class="race-layer" id="raceLayer"></div>
            </div>
          </div>
        </div>
      </div>
      <aside class="side">
        <div class="side-scroll" id="sideScroll"></div>
        <section class="chronicle" id="chronicle">
          <header class="chronicle-head">
            <span class="chronicle-title">Chronicle</span>
            <span class="chronicle-meta" id="chronicleMeta"></span>
          </header>
          <div class="chronicle-scroll" id="gameLog"></div>
        </section>
      </aside>
      <div class="hand-viewer-layer" id="handViewerLayer" hidden></div>
    </div>`);
    patchTable(g, root);
    return root;
  }

  function patchTable(g, root) {
    root = root || document.getElementById("tableRoot");
    if (!root) return;
    const me = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    const pr = g.prompt;
    const r = g.reaction;
    let text = r ? r.text : pr ? pr.text : waitingFor(g, g.turnSeat);
    if (state.targeting) {
      const nm = state.targeting.card.name;
      text = state.targeting.kind === "room"
        ? `Click a highlighted room for ${nm}.`
        : `Choose a target for ${nm}.`;
    }
    root.querySelector("#promptText").textContent = text;
    updateHits(g, root.querySelector("#overlay"));
    updateChits(g, root.querySelector("#overlay"));
    updateTokens(g, root.querySelector("#overlay"));
    const side = root.querySelector("#sideScroll");
    const fresh = viewSide(g, me);
    side.replaceWith(fresh);
    animateHpBars(fresh);
    updatePromptActs(g, me, root.querySelector("#promptActs"));
    updateChronicle(g, root);
    maybeDice(g, root.querySelector("#fxLayer"));
    maybeReveal(g, root.querySelector("#revealLayer"));
    maybeResult(g, root.querySelector("#resultLayer"));
    maybeTurnBanner(g, root.querySelector("#turnLayer"));
    maybeBoardPrompt(g, root.querySelector("#promptLayer"));
    updateRace(g, root.querySelector("#raceLayer"));
    syncHandViewer(g, me, root);
    let win = root.querySelector(".game-over");
    if (g.phase === "end" && g.prompt?.type !== "deathAnnounce") {
      if (!win) {
        const winnerSeats = new Set(g.winners || []);
        const rows = (g.players || []).map((p) => {
          const ch = (g.characters || []).find((c) => c.id === p.characterId);
          const name = playerLabel(p, ch);
          if (p.status === "dead") {
            return `<li class="died">${esc(name)} — <span>DIED</span></li>`;
          }
          const gp = p.value != null ? p.value : 0;
          const champ = winnerSeats.has(p.seat);
          return `<li class="${champ ? "champ" : ""}">${esc(name)} — ${gp} gp</li>`;
        }).join("");
        win = el(`<div class="game-over"><div class="box">
          <h2>${(g.winners || []).length ? "Escape!" : "The hoard stays"}</h2>
          <ul class="end-roster">${rows}</ul>
          <button id="back">Back to lobby</button>
        </div></div>`);
        win.querySelector("#back").onclick = () => {
          emit("game:leave", { gameId: g.id });
          state.game = null;
          state.room = null;
          state.screen = "lobby";
          render();
        };
        root.appendChild(win);
      }
    } else if (win) win.remove();
  }

  function updateHits(g, overlay) {
    overlay.querySelectorAll(".space-hit").forEach((n) => n.remove());
    const pr = g.prompt;
    const meHit = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    const mine = !!(meHit && pr && pr.seat === meHit.seat);
    const clickable = new Set((pr && pr.options) || []);
    if (state.targeting?.kind === "room") {
      Object.values(g.spaces || {}).filter((s) => s.type === "room").forEach((sp) => clickable.add(sp.id));
    }
    const show = (mine && (pr?.type === "move" || pr?.type === "catMove" || pr?.type === "doubleCat" || pr?.type === "kittyMove")) || state.targeting?.kind === "room";
    if (!show) return;
    for (const id of clickable) {
      const sp = g.spaces[id];
      if (!sp) continue;
      const hit = document.createElement("div");
      hit.className = "space-hit clickable";
      hit.style.left = sp.x + "%";
      hit.style.top = sp.y + "%";
      hit.onclick = () => {
        if (state.targeting?.kind === "room") {
          const c = state.targeting.card;
          state.targeting = null;
          act({ type: "playScroll", uid: c.uid, defId: c.defId, roomId: id });
          return;
        }
        if (pr.type === "move") act({ type: "move", spaceId: id });
        else if (pr.type === "kittyMove") act({ type: "kittyMove", spaceId: id });
        else if (pr.type === "doubleCat") act({ type: "doubleCat", spaceId: id });
        else act({ type: "catMove", spaceId: id });
      };
      overlay.appendChild(hit);
    }
  }

  function updateChits(g, overlay) {
    const prev = state.chitCounts || {};
    const next = {};
    overlay.querySelectorAll(".chit-stacks").forEach((n) => n.remove());
    let lost = 0;
    for (const [id, cell] of Object.entries(g.board || {})) {
      const red = cell.red || 0;
      const gold = cell.yellow || 0;
      next[id] = { red, gold };
      const old = prev[id] || { red: 0, gold: 0 };
      const sp = g.spaces[id];
      if (!sp) continue;
      if (state.chitReady) {
        const lostRed = Math.max(0, old.red - red);
        const lostGold = Math.max(0, old.gold - gold);
        spawnChitFx(overlay, sp, "red", lostRed, lost);
        lost += lostRed;
        spawnChitFx(overlay, sp, "gold", lostGold, lost);
        lost += lostGold;
      }
      if (!red && !gold) continue;
      const wrap = document.createElement("div");
      wrap.className = "chit-stacks";
      wrap.style.left = sp.x + "%";
      wrap.style.top = sp.y + "%";
      if (red) wrap.appendChild(makeStack("red", red));
      if (gold) wrap.appendChild(makeStack("gold", gold));
      overlay.appendChild(wrap);
    }
    state.chitCounts = next;
    state.chitReady = true;
    state.lastChitFxMs = lost ? 220 + (lost - 1) * 120 : 0;
  }

  function spawnChitFx(overlay, sp, kind, n, startIndex) {
    for (let i = 0; i < n; i++) {
      const chip = document.createElement("div");
      chip.className = "chip fly " + kind;
      chip.style.left = sp.x + "%";
      chip.style.top = sp.y + "%";
      const dx = (10 + Math.random() * 18) * (Math.random() < 0.5 ? -1 : 1);
      const dy = -36 - Math.random() * 28;
      chip.style.setProperty("--dx", dx + "px");
      chip.style.setProperty("--dy", dy + "px");
      chip.style.animationDelay = ((startIndex + i) * 0.12) + "s";
      overlay.appendChild(chip);
      const done = () => chip.remove();
      chip.addEventListener("animationend", done);
      setTimeout(done, 1400 + (startIndex + i) * 120);
    }
  }

  function makeStack(kind, n) {
    const stack = document.createElement("div");
    stack.className = "stack " + kind;
    stack.title = n + (kind === "red" ? " denizen" : " treasure") + (n === 1 ? "" : "s");
    const count = Math.max(1, n);
    stack.style.height = 12 + (count - 1) * 3 + "px";
    for (let i = 0; i < count; i++) {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.style.bottom = i * 3 + "px";
      stack.appendChild(chip);
    }
    return stack;
  }

  function tokenXY(g, loc, extraX, extraY) {
    const sp = g.spaces[loc];
    if (!sp) return null;
    return { x: sp.x + (extraX || 0), y: sp.y + (extraY || 0) };
  }

  function placeToken(el, x, y, animate) {
    if (!animate) el.classList.add("no-anim");
    el.style.left = x + "%";
    el.style.top = y + "%";
    if (!animate) requestAnimationFrame(() => el.classList.remove("no-anim"));
  }

  function walkToken(el, g, pathIds, extraX, extraY, tokenKey) {
    const pts = (pathIds || []).map((id) => {
      const xy = tokenXY(g, id, extraX, extraY);
      return xy;
    }).filter(Boolean);
    if (pts.length < 2) {
      if (pts[0]) placeToken(el, pts[0].x, pts[0].y, true);
      state.walkBusy = false;
      return;
    }
    clearTimeout(state.walkTimer);
    state.walkBusy = true;
    state.walkToken = tokenKey;
    placeToken(el, pts[0].x, pts[0].y, false);
    let i = 1;
    const hop = () => {
      if (state.walkToken !== tokenKey) return;
      if (i >= pts.length) {
        state.walkBusy = false;
        return;
      }
      placeToken(el, pts[i].x, pts[i].y, true);
      i += 1;
      state.walkTimer = setTimeout(hop, 240);
    };
    requestAnimationFrame(() => requestAnimationFrame(hop));
  }

  function updateTokens(g, overlay) {
    const me = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    const pr = g.prompt;
    const mine = !!(me && pr && pr.seat === me.seat && me.status === "active");
    const pickIds = new Set();
    if (mine && pr?.type === "catPick") (pr.cats || []).forEach((id) => pickIds.add(id));
    if (mine && pr?.type === "kittyPick") (g.cats || []).forEach((c) => pickIds.add(c.id));
    const destIds = new Set((pr && pr.options) || []);
    const catDest = mine && (pr?.type === "catMove" || pr?.type === "doubleCat" || pr?.type === "kittyMove");
    const locCount = {};
    const seen = new Set();
    for (const p of g.players) {
      if (p.status === "escaped") continue;
      const key = "p-" + p.seat;
      seen.add(key);
      locCount[p.loc] = (locCount[p.loc] || 0) + 1;
      const n = locCount[p.loc];
      const xy = tokenXY(g, p.loc, (n - 1) * 1.1, 0);
      if (!xy) continue;
      let pawn = overlay.querySelector(`[data-token="${key}"]`);
      const first = !pawn;
      if (!pawn) {
        pawn = document.createElement("div");
        pawn.className = "token pawn";
        pawn.dataset.token = key;
        overlay.appendChild(pawn);
      }
      pawn.title = p.name;
      pawn.classList.toggle("dead", p.status === "dead");
      pawn.classList.toggle("wounded", !!(g.prompt && g.prompt.wound && g.prompt.woundSeat === p.seat));
      const art = portraitOf(g, p.characterId);
      pawn.style.backgroundColor = CHAR_COLOR[p.characterId] || "#3a2c22";
      pawn.style.borderColor = CHAR_COLOR[p.characterId] || "#fff";
      let face = pawn.querySelector("img");
      if (art) {
        if (!face) {
          face = document.createElement("img");
          face.alt = "";
          pawn.appendChild(face);
        }
        if (face.getAttribute("src") !== art) face.src = art;
        pawn.style.backgroundImage = "";
      } else {
        if (face) face.remove();
        pawn.style.backgroundImage = "";
      }
      const landOn = catDest && p.status === "active" && destIds.has(p.loc);
      pawn.classList.toggle("cat-target", landOn);
      pawn.onclick = landOn
        ? (e) => {
            e.stopPropagation();
            if (pr.type === "kittyMove") act({ type: "kittyMove", spaceId: p.loc });
            else if (pr.type === "doubleCat") act({ type: "doubleCat", spaceId: p.loc });
            else act({ type: "catMove", spaceId: p.loc });
          }
        : null;
      const fx = g.walkFx;
      if (!first && fx && fx.token === key && fx.seq !== state.lastWalkSeq) {
        state.lastWalkSeq = fx.seq;
        walkToken(pawn, g, fx.path, (n - 1) * 1.1, 0, key);
      } else if (!(state.walkBusy && state.walkToken === key)) {
        placeToken(pawn, xy.x, xy.y, !first);
      }
    }
    for (const c of g.cats) {
      const key = "c-" + c.id;
      seen.add(key);
      const xy = tokenXY(g, c.loc, 0, -1.6);
      if (!xy) continue;
      let cat = overlay.querySelector(`[data-token="${key}"]`);
      const first = !cat;
      if (!cat) {
        cat = document.createElement("div");
        cat.className = "token cat " + c.id;
        cat.dataset.token = key;
        overlay.appendChild(cat);
      }
      cat.className = "token cat " + c.id + (pickIds.has(c.id) ? " pickable" : "");
      cat.textContent = "";
      cat.title = pickIds.has(c.id) ? `Click to move ${c.name}` : `${c.name} (${c.role})`;
      cat.onclick = pickIds.has(c.id)
        ? () => act({ type: pr.type === "kittyPick" ? "kittyPick" : "catPick", catId: c.id })
        : null;
      const fx = g.walkFx;
      if (!first && fx && fx.token === key && fx.seq !== state.lastWalkSeq) {
        state.lastWalkSeq = fx.seq;
        walkToken(cat, g, fx.path, 0, -1.6, key);
      } else if (!(state.walkBusy && state.walkToken === key)) {
        placeToken(cat, xy.x, xy.y, !first);
      }
    }
    overlay.querySelectorAll("[data-token]").forEach((n) => {
      if (!seen.has(n.dataset.token)) n.remove();
    });
  }

  function pipFace(n) {
    const cells = PIP_CELLS[n];
    const bits = [];
    for (let i = 1; i <= 9; i++) bits.push(cells.includes(i) ? "<i></i>" : "<span></span>");
    return `<div class="pip-face f${n}"><div class="pips">${bits.join("")}</div></div>`;
  }

  function makeDie(face) {
    const [rx, ry] = DIE_ROT[face] || DIE_ROT[1];
    const die = el(`<div class="die rolling">${[1, 2, 3, 4, 5, 6].map(pipFace).join("")}</div>`);
    die.style.setProperty("--rx", rx + "deg");
    die.style.setProperty("--ry", ry + "deg");
    die.addEventListener("animationend", () => {
      die.classList.remove("rolling");
      die.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    return die;
  }

  function maybeDice(g, layer) {
    const fx = g.diceFx;
    if (!fx || !fx.seq || fx.seq === state.lastDiceSeq) return;
    if (g.now && fx.endsAt && g.now > fx.endsAt + 200) {
      state.lastDiceSeq = fx.seq;
      return;
    }
    state.lastDiceSeq = fx.seq;
    layer.innerHTML = "";
    (fx.faces || []).forEach((n) => layer.appendChild(makeDie(n)));
    setTimeout(() => { if (layer) layer.innerHTML = ""; }, 1600);
  }

  function syncCardAction(layer, me, pr) {
    const mine = !!(me && pr && pr.seat === me.seat && me.status === "active");
    const outlook = pr && pr.type === "combat" ? (pr.outlook || "roll") : "";
    const kind = mine && ["roomReveal", "combat", "chooseStat", "combatBoost"].includes(pr.type)
      ? (pr.type === "combat" ? "combat:" + outlook : pr.type === "combatBoost" ? "boost:" + (pr.hp || 0) + ":" + (pr.playerTotal || 0) + ":" + (pr.need || 0) : pr.type)
      : "";
    layer.classList.toggle("interactive", !!kind);
    if (layer.dataset.actKey === kind) return;
    layer.dataset.actKey = kind;
    layer.querySelectorAll(".card-act").forEach((n) => n.remove());
    const host = pr.type === "roomReveal"
      ? layer.querySelector(".flip-face.front .body")
      : (layer.querySelector(".combat-panel") || layer.querySelector(".flip-face.front .body"));
    if (!host || !kind) return;
    if (pr.type === "roomReveal") {
      const btn = el(`<button class="continue-reveal primary card-act" type="button">Continue</button>`);
      btn.onclick = (e) => { e.stopPropagation(); act({ type: "continue" }); };
      host.appendChild(btn);
      return;
    }
    if (pr.type === "chooseStat") {
      const wrap = el(`<div class="card-act choose-row">
        <button type="button" data-stat="might">Might</button>
        <button type="button" data-stat="guile">Guile</button>
      </div>`);
      wrap.querySelectorAll("button").forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); act({ type: "chooseStat", stat: b.dataset.stat }); };
      });
      host.appendChild(wrap);
      return;
    }
    if (pr.type === "combatBoost") {
      const wrap = el(`<div class="card-act boost-row"></div>`);
      const need = pr.need || 1;
      const hp = pr.hp || 0;
      if (hp > need) {
        const all = el(`<button class="primary" type="button">Spend ${need} HP to win</button>`);
        all.onclick = (e) => { e.stopPropagation(); act({ type: "spendCombatHp", n: need }); };
        wrap.appendChild(all);
      }
      const skip = el(`<button type="button">Take the wound</button>`);
      skip.onclick = (e) => { e.stopPropagation(); act({ type: "continue" }); };
      wrap.appendChild(skip);
      host.appendChild(wrap);
      return;
    }
    const outlookKind = pr.outlook === "win" || pr.outlook === "lose" ? pr.outlook : null;
    const label = outlookKind === "win" ? "Auto-Win" : outlookKind === "lose" ? "Auto-Lose" : "Roll";
    const btn = el(`<button class="continue-reveal primary card-act" type="button">${label}</button>`);
    btn.onclick = (e) => {
      e.stopPropagation();
      act(outlookKind ? { type: "resolveCombat", auto: outlookKind } : { type: "resolveCombat" });
    };
    host.appendChild(btn);
  }

  function fighterLabel(g, pr) {
    const p = (g.players || []).find((x) => x.seat === pr.seat);
    if (!p) return "";
    const ch = (g.characters || []).find((c) => c.id === p.characterId);
    return playerLabel(p, ch);
  }

  function playScoreCount(layer, pr) {
    const key = [pr.denizen && pr.denizen.id, pr.playerCs, pr.playerTotal, pr.roll, pr.win, pr.auto].join(":");
    if (state.scoreAnimKey === key) return;
    state.scoreAnimKey = key;
    const foe = layer.querySelector(".denizen-cs-num");
    const plus = layer.querySelector(".cs-plus");
    const duel = layer.querySelector(".cs-duel");
    const you = layer.querySelector(".cs-side.you");
    const totalWrap = layer.querySelector(".cs-total");
    const totalEl = layer.querySelector(".player-total-num");
    if (!duel) return;
    if (foe && pr.denizenCs != null) foe.textContent = pr.denizenCs;
    if (plus) plus.hidden = true;
    duel.classList.remove("cs-win", "cs-lose", "win", "lose");
    fillPlayerSplit(layer, pr, { showRoll: pr.auto !== "lose" && pr.roll != null });
    if (you) you.classList.remove("collapsed");
    if (totalWrap) totalWrap.classList.remove("on");
    if (totalEl) totalEl.classList.remove("cs-win", "cs-lose");
    const collapse = pr.auto ? 350 : 700;
    const started = performance.now();
    const step = (now) => {
      if (state.scoreAnimKey !== key) return;
      if (now - started < collapse) {
        requestAnimationFrame(step);
        return;
      }
      if (you) you.classList.add("collapsed");
      if (totalWrap) totalWrap.classList.add("on");
      if (totalEl) {
        totalEl.textContent = String(pr.playerTotal != null ? pr.playerTotal : pr.playerCs);
        totalEl.classList.add(pr.win ? "cs-win" : "cs-lose");
      }
    };
    requestAnimationFrame(step);
  }

  function d6IconHtml() {
    return `<svg class="d6-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="#f4efe4" stroke="#c9a227" stroke-width="1.8"/>
      <circle cx="8" cy="8" r="1.7" fill="#1a1210"/>
      <circle cx="16" cy="8" r="1.7" fill="#1a1210"/>
      <circle cx="12" cy="12" r="1.7" fill="#1a1210"/>
      <circle cx="8" cy="16" r="1.7" fill="#1a1210"/>
      <circle cx="16" cy="16" r="1.7" fill="#1a1210"/>
    </svg>`;
  }

  function fillPlayerSplit(layer, pr, opts) {
    const stat = layer.querySelector(".player-stat-num");
    const label = layer.querySelector(".player-stat-label");
    const room = layer.querySelector(".player-room-num");
    const op = layer.querySelector(".cs-op:not(.die-op)");
    const die = layer.querySelector(".player-die-num");
    const roomN = pr.roomCs != null ? pr.roomCs : 0;
    if (stat) stat.textContent = pr.playerStat != null ? pr.playerStat : (pr.playerCs || 0);
    if (label) label.textContent = pr.playerStatLabel || (pr.use === "guile" ? "Guile" : "Might");
    if (room) room.textContent = String(Math.abs(roomN));
    if (op) op.textContent = roomN < 0 ? "−" : "+";
    if (die) {
      if (opts && opts.showRoll && pr.roll != null) die.textContent = String(pr.roll);
      else die.innerHTML = d6IconHtml();
    }
  }

  function syncDenizenScores(layer, g, pr) {
    const duel = layer.querySelector(".cs-duel");
    if (!duel) return;
    if (pr.playerCs == null || pr.denizenCs == null) {
      duel.hidden = true;
      return;
    }
    duel.hidden = false;
    const foe = layer.querySelector(".denizen-cs-num");
    const plus = layer.querySelector(".cs-plus");
    const you = layer.querySelector(".cs-side.you");
    const totalWrap = layer.querySelector(".cs-total");
    const totalEl = layer.querySelector(".player-total-num");
    const nameEl = layer.querySelector(".player-total-label");
    if (nameEl) nameEl.textContent = fighterLabel(g, pr);
    if (pr.type === "combatBoost" && pr.playerTotal != null) {
      state.scoreAnimKey = "";
      fillPlayerSplit(layer, pr, { showRoll: pr.roll != null });
      if (you) you.classList.add("collapsed");
      if (totalWrap) totalWrap.classList.add("on");
      if (totalEl) {
        totalEl.textContent = String(pr.playerTotal);
        totalEl.classList.toggle("cs-win", !!pr.win);
        totalEl.classList.toggle("cs-lose", !pr.win);
      }
      if (foe && pr.denizenCs != null) foe.textContent = pr.denizenCs;
      if (plus) plus.hidden = true;
      return;
    }
    if (pr.type === "combatPause" && pr.playerTotal != null) {
      playScoreCount(layer, pr);
      return;
    }
    state.scoreAnimKey = "";
    duel.classList.remove("cs-win", "cs-lose", "win", "lose");
    fillPlayerSplit(layer, pr);
    if (you) you.classList.remove("collapsed");
    if (totalWrap) totalWrap.classList.remove("on");
    if (totalEl) totalEl.classList.remove("cs-win", "cs-lose");
    if (foe) foe.textContent = pr.denizenCs;
    const mightEl = layer.querySelector(".denizen-stats .might b");
    const guileEl = layer.querySelector(".denizen-stats .guile b");
    if (mightEl && pr.denizen && pr.denizen.might != null) mightEl.textContent = pr.denizen.might;
    if (guileEl && pr.denizen && pr.denizen.guile != null) guileEl.textContent = pr.denizen.guile;
    const flavor = layer.querySelector(".denizen-front .meta");
    if (flavor && pr.denizen && pr.denizen.flavor) flavor.textContent = pr.denizen.flavor;
    if (plus) plus.hidden = true;
  }

  function isDenizenFightResult(pr) {
    return pr?.type === "combatResult" && pr.denizen && !pr.catHit && !pr.catWound && !pr.catDump;
  }

  function combatOutcomeHtml(g, pr, me) {
    const fighter = g.players.find((p) => p.seat === pr.seat);
    const fch = fighter && (g.characters || []).find((c) => c.id === fighter.characterId);
    const xName = fighter ? playerLabel(fighter, fch) : "Someone";
    const yName = pr.denizen?.name || "the denizen";
    const loot = lootCardsHtml(pr.loot);
    const cont = continueHtml(g, me, pr);
    if (pr.win) {
      return `<div class="denizen-banner win">Victory</div>
        <div class="body">
          <h2>Victory!</h2>
          <p>${esc(xName)} defeats ${esc(yName)}.</p>
          ${pr.more ? `<p>Another denizen remains.</p>` : ""}
          ${loot ? `<p class="loot-label">Loot</p><div class="loot-got">${loot}</div>` : ""}
          ${!pr.more && (pr.dragon || pr.denizen?.id === "dragon") ? `<p>${esc(xName)} escapes the Den!</p>` : ""}
          ${cont}
        </div>`;
    }
    if (pr.ignored) {
      return `<div class="denizen-banner">Ignored</div>
        <div class="body">
          <h2>Ignored!</h2>
          <p>${esc(xName)} shrugs off ${esc(yName)}.</p>
          ${cont}
        </div>`;
    }
    return `<div class="denizen-banner">Wound</div>
      <div class="body">
        <h2>Wounded!</h2>
        <p>${esc(yName)} strikes ${esc(xName)}.</p>
        ${cont}
      </div>`;
  }

  function bindOutcomeContinue(root) {
    const btn = root.querySelector(".card-act");
    if (btn) btn.onclick = (e) => { e.stopPropagation(); act({ type: "continue" }); };
  }

  function sizeVictoryWrap(layer, lootCount) {
    const wrap = layer && layer.querySelector(".flip-wrap");
    if (!wrap) return;
    const n = lootCount || 0;
    wrap.classList.toggle("wide-loot", n > 2);
    wrap.style.width = n > 2 ? Math.min(300 + (n - 2) * 120, 920) + "px" : "";
  }

  function showCombatOutcomeCard(layer, g, pr, me) {
    const key = "outcome:" + (pr.denizen?.id || pr.denizen?.name || "") + ":" + (pr.win ? "w" : "l") + ":" + (pr.ignored ? "i" : "") + ":" + (pr.more ? "m" : "") + ":" + (pr.loot || []).map((c) => c.uid).join(",");
    const canContinue = canDismissPrompt(me, pr);
    if (state.revealKey === key) {
      layer.classList.add("show");
      layer.classList.toggle("interactive", canContinue);
      return;
    }
    const html = combatOutcomeHtml(g, pr, me);
    const existing = layer.querySelector("#flipCard");
    if (existing && String(state.revealKey).startsWith("denizen:")) {
      const back = existing.querySelector(".flip-face.back");
      if (back) {
        back.className = "flip-face back outcome" + (pr.win ? "" : " lose-face");
        back.innerHTML = html;
        bindOutcomeContinue(back);
        const pane = back.querySelector(".loot-got");
        if (pane) pane.scrollTop = 0;
      }
      existing.querySelectorAll(".card-act").forEach((n) => {
        if (!back || !back.contains(n)) n.remove();
      });
      const fightPanel = layer.querySelector(".combat-panel");
      if (fightPanel) fightPanel.hidden = true;
      state.revealKey = key;
      layer.dataset.actKey = "";
      layer.classList.add("show");
      layer.classList.toggle("interactive", canContinue);
      sizeVictoryWrap(layer, (pr.loot || []).length);
      const delay = pr.win ? Math.max(80, state.lastChitFxMs || 0) : 80;
      setTimeout(() => {
        if (state.revealKey !== key) return;
        existing.classList.remove("flipped");
      }, delay);
      return;
    }
    state.revealKey = key;
    layer.innerHTML = `<div class="flip-wrap"><div class="flip-card" id="flipCard">
      <div class="flip-face back"></div>
      <div class="flip-face front denizen-front${pr.win ? "" : " lose-face"}">${html}</div>
    </div></div>`;
    bindOutcomeContinue(layer);
    layer.classList.add("show");
    layer.classList.toggle("interactive", canContinue);
    sizeVictoryWrap(layer, (pr.loot || []).length);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = layer.querySelector("#flipCard");
        if (card) card.classList.add("flipped");
      });
    });
  }

  function maybeReveal(g, layer) {
    const me = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    const pr = g.prompt;
    if (isDenizenFightResult(pr)) {
      showCombatOutcomeCard(layer, g, pr, me);
      return;
    }
    if (pr?.type === "combatResult" || pr?.type === "lootResult" || pr?.type === "raceResult") {
      if (state.revealKey) {
        layer.classList.remove("show", "interactive");
        layer.innerHTML = "";
        layer.dataset.actKey = "";
        state.revealKey = "";
        state.scoreAnimKey = "";
      }
      return;
    }
    if (pr?.denizen && ["denizenReveal", "combat", "chooseStat", "diceWait", "combatPause", "combatBoost"].includes(pr.type)) {
      const key = "denizen:" + pr.denizen.id;
      if (state.revealKey !== key) {
        state.revealKey = key;
        state.scoreAnimKey = "";
        const d = pr.denizen;
        const showMight = d.might != null;
        const showGuile = d.guile != null;
        const showOr = showMight && showGuile;
        const foeName = d.id === "dragon" ? "Dragon" : "Denizen";
        const art = `/assets/denizens/${d.id}.png?v=2`;
        layer.innerHTML = `<div class="combat-stack">
          <div class="flip-wrap"><div class="flip-card" id="flipCard">
          <div class="flip-face back"></div>
          <div class="flip-face front denizen-front">
            <div class="denizen-banner">${foeName}</div>
            <div class="body">
              <h2>${esc(d.name)}</h2>
              <div class="denizen-art">
                <img src="${art}" alt="">
                <p class="meta">${esc(d.flavor || "")}</p>
              </div>
              <div class="denizen-stats">
                ${showMight ? `<div class="stat might"><span>Might</span><b>${d.might}</b></div>` : ""}
                ${showOr ? `<span class="or">OR</span>` : ""}
                ${showGuile ? `<div class="stat guile"><span>Guile</span><b>${d.guile}</b></div>` : ""}
              </div>
            </div>
          </div>
        </div></div>
          <div class="combat-panel" hidden>
            <div class="cs-duel" hidden>
              <div class="cs-side you">
                <div class="cs-formula">
                  <div class="cs-row nums">
                    <b class="player-stat-num">0</b>
                    <span class="cs-op">+</span>
                    <b class="player-room-num">0</b>
                    <span class="cs-op die-op">+</span>
                    <b class="player-die-num">${d6IconHtml()}</b>
                  </div>
                  <div class="cs-row labs">
                    <span class="player-stat-label">Might</span>
                    <span class="cs-op-slot"></span>
                    <span>Room</span>
                    <span class="cs-op-slot"></span>
                    <span>d6</span>
                  </div>
                </div>
                <div class="cs-total">
                  <b class="player-total-num">0</b>
                  <span class="player-total-label"></span>
                </div>
              </div>
              <div class="cs-mid">vs</div>
              <div class="cs-side foe">
                <div class="cs-row nums">
                  <b class="denizen-cs-num">0</b>
                </div>
                <div class="cs-row labs">
                  <span>${foeName}</span>
                </div>
              </div>
            </div>
            <p class="cs-plus" hidden></p>
          </div>
        </div>`;
        layer.dataset.actKey = "";
        layer.classList.add("show");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const card = layer.querySelector("#flipCard");
            if (card) card.classList.add("flipped");
          });
        });
      } else {
        layer.classList.add("show");
      }
      const fightPanel = layer.querySelector(".combat-panel");
      if (fightPanel) {
        fightPanel.hidden = !["combat", "chooseStat", "diceWait", "combatPause", "combatBoost"].includes(pr.type);
      }
      syncDenizenScores(layer, g, pr);
      syncCardAction(layer, me, pr);
      return;
    }
    if (pr?.type === "roomReveal" && pr.room) {
      const key = "room:" + (pr.loc || "") + ":" + pr.room.id;
      if (state.revealKey !== key) {
        state.revealKey = key;
        const art = pr.room.art || `/assets/rooms/${pr.room.id}.png`;
        layer.innerHTML = `<div class="flip-wrap"><div class="flip-card" id="flipCard">
          <div class="flip-face back"></div>
          <div class="flip-face front">
            <img src="${art}" alt="${esc(pr.room.name)}" />
            <div class="body"><h2>${esc(pr.room.name)}</h2><p>${esc(pr.room.text)}</p><p class="meta">${esc(pr.room.flavor || "")}</p></div>
          </div>
        </div></div>`;
        layer.dataset.actKey = "";
        layer.classList.add("show");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const card = layer.querySelector("#flipCard");
            if (card) card.classList.add("flipped");
          });
        });
      } else {
        layer.classList.add("show");
      }
      syncCardAction(layer, me, pr);
      return;
    }
    if (state.revealKey) {
      layer.classList.remove("show", "interactive");
      layer.innerHTML = "";
      layer.dataset.actKey = "";
      state.revealKey = "";
      state.scoreAnimKey = "";
    }
  }

  function lootCardHtml(c) {
    const text = c.kind === "scroll" ? (c.text || "") : `${c.value || 0} gp`;
    const tip = text ? ` data-full="${esc(text)}"` : "";
    return `<div class="card ${c.kind === "scroll" ? "scroll" : ""}">
      <div class="card-art">${lootArt(c.defId)}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="meta"${tip}>${esc(text)}</div>
    </div>`;
  }

  function lootCardsHtml(cards) {
    return (cards || []).map(lootCardHtml).join("");
  }

  function paintResult(layer, g, pr, me, key) {
    if (state.resultPending !== key && state.resultKey !== key) return;
    state.resultKey = key;
    state.resultPending = "";
    const canContinue = canDismissPrompt(me, pr);
    const fighter = g.players.find((p) => p.seat === pr.seat) || g.players.find((p) => p.seat === pr.woundSeat);
    const fch = fighter && (g.characters || []).find((c) => c.id === fighter.characterId);
    const xName = fighter ? playerLabel(fighter, fch) : "The thief";
    const yName = pr.denizen?.name || "the denizen";
    const loot = lootCardsHtml(pr.loot);
    const cont = continueHtml(g, me, pr);
    if (pr.type === "raceResult") {
      const rows = (pr.times || []).slice().sort((a, b) => (a.ms == null ? 1 : b.ms == null ? -1 : a.ms - b.ms))
        .map((t) => `<li>${esc(t.name)} — ${t.ms == null ? "no click" : (t.ms / 1000).toFixed(2) + "s"}</li>`).join("");
      const title = pr.kind === "cup" ? "IN THE CUP" : "DOUBLE!";
      layer.innerHTML = `<div class="combat-banner victory">
        <h2>${title}</h2>
        <p>${esc(pr.text || (pr.winnerName || "Someone") + " wins!")}</p>
        ${rows ? `<ol class="race-times">${rows}</ol>` : ""}
        ${cont}
      </div>`;
    } else if (pr.catDump) {
      const lost = (pr.loot && pr.loot[0] && pr.loot[0].name) || "an item";
      layer.innerHTML = `<div class="combat-banner lose dump">
        <h2>Lost an item!</h2>
        <p>${esc(xName)} lost ${esc(lost)} to ${esc(yName)}.</p>
        ${loot ? `<div class="loot-got">${loot}</div>` : ""}
        ${cont}
      </div>`;
    } else if (pr.type === "lootResult") {
      const loss = pr.kind === "loss";
      layer.innerHTML = `<div class="combat-banner ${loss ? "lose dump" : "loot"}">
        <h2>${esc(pr.title || (loss ? "Discarded!" : "Loot!"))}</h2>
        <p>${esc(pr.text || (loss ? (xName + " discards a card.") : (xName + " claims the treasure.")))}</p>
        ${loot ? `<div class="loot-got">${loot}</div>` : ""}
        ${cont}
      </div>`;
    } else if (pr.win) {
      layer.innerHTML = `<div class="combat-banner victory">
        <h2>Victory!</h2>
        <p>${esc(xName)} defeats ${esc(yName)}.</p>
        ${pr.more ? `<p>Another denizen remains.</p>` : ""}
        ${loot ? `<p class="loot-label">Loot</p><div class="loot-got">${loot}</div>` : ""}
        ${!pr.more && (pr.dragon || pr.denizen?.id === "dragon") ? `<p>${esc(xName)} escapes the Den!</p>` : ""}
        ${cont}
      </div>`;
    } else if (pr.ignored) {
      layer.innerHTML = `<div class="combat-banner lose">
        <h2>Ignored!</h2>
        <p>${esc(xName)} shrugs off ${esc(yName)}.</p>
        ${cont}
      </div>`;
    } else {
      layer.innerHTML = `<div class="combat-banner lose">
        <h2>Wounded!</h2>
        <p>${esc(yName)} strikes ${esc(xName)}.</p>
        ${cont}
      </div>`;
    }
    const btn = layer.querySelector(".card-act");
    if (btn) btn.onclick = (e) => { e.stopPropagation(); act({ type: "continue" }); };
    layer.classList.add("show");
    layer.classList.toggle("interactive", canContinue);
  }

  function maybeResult(g, layer) {
    if (!layer) return;
    const me = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    const pr = g.prompt;
    if (isDenizenFightResult(pr)) {
      if (state.resultTimer) {
        clearTimeout(state.resultTimer);
        state.resultTimer = null;
      }
      if (state.resultKey || state.resultPending) {
        layer.classList.remove("show", "interactive");
        layer.innerHTML = "";
        state.resultKey = "";
        state.resultPending = "";
      }
      return;
    }
    if (pr?.type !== "combatResult" && pr?.type !== "lootResult" && pr?.type !== "raceResult") {
      if (state.resultTimer) {
        clearTimeout(state.resultTimer);
        state.resultTimer = null;
      }
      if (state.resultKey || state.resultPending) {
        layer.classList.remove("show", "interactive");
        layer.innerHTML = "";
        state.resultKey = "";
        state.resultPending = "";
      }
      return;
    }
    const key = pr.type === "raceResult"
      ? "race:" + (pr.kind || "") + ":" + (pr.winnerSeat ?? "") + ":" + (pr.loserSeat ?? "")
      : (pr.type === "lootResult" ? "loot:" : "result:") + (pr.title || "") + ":" + (pr.kind || "") + ":" + (pr.denizen?.id || pr.denizen?.name || "") + ":" + (pr.win ? "w" : "l") + ":" + (pr.ignored ? "i" : "") + ":" + (pr.woundSeat ?? "") + ":" + (pr.catDump ? "d" : pr.catWound ? "c" : "") + ":" + (pr.loot || []).map((c) => c.uid).join(",");
    const canContinue = canDismissPrompt(me, pr);
    if (state.resultKey === key) {
      layer.classList.toggle("interactive", canContinue);
      return;
    }
    if (state.resultPending === key) return;
    state.resultPending = key;
    const delay = pr.type === "raceResult" ? 60 : (pr.win || pr.type === "lootResult" ? (state.lastChitFxMs || 280) : 80);
    const show = () => paintResult(layer, g, pr, me, key);
    if (delay > 40) {
      clearTimeout(state.resultTimer);
      state.resultTimer = setTimeout(show, delay);
      return;
    }
    show();
  }

  function flashBanner(layer, key, text, extraClass, ms) {
    if (state.bannerKey === key) return;
    state.bannerKey = key;
    const yours = /\byours\b/.test(extraClass || "");
    layer.innerHTML = `<div class="turn-flash${extraClass ? " " + extraClass : ""}">${text}</div>`;
    layer.classList.add("show");
    layer.classList.toggle("yours", yours);
    layer.classList.toggle("death", /\bdeath\b/.test(extraClass || ""));
    state.turnBannerUntil = Date.now() + ms;
    clearTimeout(state.turnBannerTimer);
    state.turnBannerTimer = setTimeout(() => {
      if (state.bannerKey !== key) return;
      layer.classList.remove("show", "yours", "death");
      layer.innerHTML = "";
      state.bannerKey = "";
    }, ms + 200);
  }

  function maybeTurnBanner(g, layer) {
    if (!layer) return;
    const pr = g.prompt;
    if (pr?.type === "turnAnnounce") {
      const actor = g.players.find((p) => p.seat === pr.seat);
      const ch = actor && (g.characters || []).find((c) => c.id === actor.characterId);
      const name = actor ? playerLabel(actor, ch) : "Someone";
      const yours = !!(actor && actor.id === state.playerId);
      state.lastTurnSeq = g.turnSeq || state.lastTurnSeq;
      flashBanner(layer, "turn:" + (g.turnSeq || 0), esc(name) + "'s Turn", yours ? "yours" : "", 1700);
      return;
    }
    if (pr?.type === "catAnnounce") {
      const actor = g.players.find((p) => p.seat === pr.seat);
      const ch = actor && (g.characters || []).find((c) => c.id === actor.characterId);
      const name = actor ? playerLabel(actor, ch) : "Someone";
      const yours = !!(actor && actor.id === state.playerId);
      flashBanner(layer, "cat:" + pr.seat + ":" + (pr.catId || "") + ":" + (g.turnSeq || 0), `${esc(name)} to move a cat!`, (yours ? "yours " : "") + "cat line", 1600);
      return;
    }
    if (pr?.type === "fightAnnounce") {
      state.lastTurnSeq = g.turnSeq || state.lastTurnSeq;
      const actor = g.players.find((p) => p.seat === pr.seat);
      const ch = actor && (g.characters || []).find((c) => c.id === actor.characterId);
      const name = actor ? playerLabel(actor, ch) : "Someone";
      const yours = !!(actor && actor.id === state.playerId);
      flashBanner(layer, "fight:" + pr.seat + ":" + (g.turnSeq || 0), `${esc(name)} is still fighting!`, (yours ? "yours " : "") + "line", 1100);
      return;
    }
    if (pr?.type === "deathAnnounce") {
      const actor = g.players.find((p) => p.seat === pr.seat);
      const ch = actor && (g.characters || []).find((c) => c.id === actor.characterId);
      const name = actor ? playerLabel(actor, ch) : "Someone";
      flashBanner(layer, "death:" + pr.seat + ":" + (g.turnSeq || 0), `${esc(name)} has died.`, "death", 1800);
      return;
    }
    if (state.bannerKey && (String(state.bannerKey).startsWith("cat:") || String(state.bannerKey).startsWith("fight:") || String(state.bannerKey).startsWith("turn:") || String(state.bannerKey).startsWith("death:"))) {
      clearTimeout(state.turnBannerTimer);
      layer.classList.remove("show", "yours", "death");
      layer.innerHTML = "";
      state.bannerKey = "";
    }
    if (g.phase !== "play" || !g.turnSeq) return;
    if (state.lastTurnSeq === g.turnSeq) return;
    state.lastTurnSeq = g.turnSeq;
    const actor = g.players.find((p) => p.seat === g.turnSeat);
    const ch = actor && (g.characters || []).find((c) => c.id === actor.characterId);
    const name = actor ? playerLabel(actor, ch) : "Someone";
    const yours = !!(actor && actor.id === state.playerId);
    flashBanner(layer, "turn:" + g.turnSeq, esc(name) + "'s Turn", yours ? "yours" : "", 1700);
  }

  function maybeBoardPrompt(g, layer) {
    if (!layer) return;
    const me = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    const pr = g.prompt;
    const r = g.reaction;
    const hide = () => {
      if (state.boardPromptKey) {
        layer.classList.remove("show", "interactive");
        layer.innerHTML = "";
        state.boardPromptKey = "";
      }
    };
    if (r && (r.type === "double" || r.type === "cup")) {
      hide();
      return;
    }

    let key = "";
    let html = "";
    let mine = false;
    let waitForBanner = false;
    let bind = () => {};

    if (state.targeting && state.targeting.kind !== "room") {
      const t = state.targeting;
      key = "target:" + t.kind + ":" + t.card.uid;
      mine = true;
      html = `<div class="board-prompt">
        <h2>${esc(t.card.name)}</h2>
        <p>Choose a target.</p>
        <div class="prompt-btns target-list"></div>
      </div>`;
      bind = (elayer) => {
        const box = elayer.querySelector(".prompt-btns");
        scrollTargetPlayers(g, me, t.card, t.kind).forEach((p) => {
          const b = targetPlayerButton(g, p);
          b.onclick = (e) => {
            e.stopPropagation();
            const c = state.targeting && state.targeting.card;
            state.targeting = null;
            if (c) act({ type: "playScroll", uid: c.uid, defId: c.defId, targetSeat: p.seat });
          };
          box.appendChild(b);
        });
        if (t.kind === "combatant") {
          const d = document.createElement("button");
          d.type = "button";
          d.className = "target-pick";
          d.innerHTML = `<span>${(g.prompt && g.prompt.denizen && g.prompt.denizen.id === "dragon") ? "The Dragon" : "The denizen"}</span>`;
          d.onclick = (e) => {
            e.stopPropagation();
            const c = state.targeting && state.targeting.card;
            state.targeting = null;
            if (c) act({ type: "playScroll", uid: c.uid, defId: c.defId, targetSeat: "denizen" });
          };
          box.appendChild(d);
        }
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "danger";
        cancel.textContent = "Cancel";
        cancel.onclick = (e) => { e.stopPropagation(); state.targeting = null; render(); };
        elayer.querySelector(".board-prompt").appendChild(cancel);
      };
    } else if (r?.type === "who") {
      key = "who:" + (r.endsAt || "") + ":" + (r.casterSeat ?? "");
      mine = !!(me && !me.isAI);
      html = `<div class="board-prompt">
        <h2>Who wants it?</h2>
        <p>${esc(r.text || "Name a player.")}</p>
        ${mine ? `<div class="prompt-btns target-list"></div>` : `<p class="muted">Waiting for a player to name someone…</p>`}
      </div>`;
      bind = (elayer) => {
        const box = elayer.querySelector(".prompt-btns");
        if (!box) return;
        const caster = g.players.find((p) => p.seat === r.casterSeat);
        scrollTargetPlayers(g, caster, { defId: "who" }, "who").forEach((p) => {
          const b = targetPlayerButton(g, p);
          b.onclick = (e) => { e.stopPropagation(); act({ type: "react", react: "who", targetSeat: p.seat }); };
          box.appendChild(b);
        });
      };
    } else if (r?.type === "fork") {
      key = "fork:" + (r.endsAt || "") + ":" + (r.targetSeat ?? "");
      mine = !!(me && me.seat === r.targetSeat);
      html = `<div class="board-prompt">
        <h2>Fork You Too, Buddy!</h2>
        <p>${esc(r.text || "Fork it back?")}</p>
        ${mine ? `<div class="prompt-btns">
          <button class="primary" type="button" data-fork="yes">Fork it back</button>
          <button type="button" data-fork="no">Decline</button>
        </div>` : `<p class="muted">${esc(waitingFor(g, r.targetSeat, "answer"))}</p>`}
      </div>`;
      bind = (elayer) => {
        const y = elayer.querySelector('[data-fork="yes"]');
        const n = elayer.querySelector('[data-fork="no"]');
        if (y) y.onclick = (e) => { e.stopPropagation(); act({ type: "react", react: "fork" }); };
        if (n) n.onclick = (e) => { e.stopPropagation(); act({ type: "react", react: "declineFork" }); };
      };
    } else if (pr?.type === "petCat") {
      key = "petCat";
      mine = !!(me && !me.isAI);
      html = `<div class="board-prompt">
        <h2>First player</h2>
        <p>Who most recently pet a cat?</p>
        ${mine ? `<button class="primary card-act" type="button">I did</button>` : `<p class="muted">Waiting for a player to claim first player…</p>`}
      </div>`;
      bind = (elayer) => {
        const btn = elayer.querySelector(".card-act");
        if (btn) btn.onclick = (e) => { e.stopPropagation(); act({ type: "claimPetCat" }); };
      };
    } else if (pr?.type === "preMove" && !state.targeting) {
      waitForBanner = true;
      key = "preMove:" + pr.seat + ":" + (g.turnSeq || 0);
      mine = !!(me && pr.seat === me.seat);
      const actor = g.players.find((p) => p.seat === pr.seat);
      const ch = actor && (g.characters || []).find((c) => c.id === actor.characterId);
      const name = actor ? playerLabel(actor, ch) : "Someone";
      html = `<div class="board-prompt">
        <h2>${esc(name)}'s move</h2>
        <p>${mine ? "Play a scroll from your hand, or roll to move." : esc(waitingFor(g, pr.seat, "roll movement"))}</p>
        ${mine ? `<button class="primary card-act" type="button">Roll movement</button>` : ""}
      </div>`;
      bind = (elayer) => {
        const btn = elayer.querySelector(".card-act");
        if (btn) btn.onclick = (e) => { e.stopPropagation(); act({ type: "rollMove" }); };
      };
    } else if (pr?.type === "overCarry") {
      if (me && pr.seat === me.seat) {
        hide();
        return;
      }
      key = "overCarry:" + pr.seat + ":" + (pr.cap || 0) + ":" + (pr.text || "");
      mine = false;
      html = `<div class="board-prompt">
        <h2>Sack full</h2>
        <p>${esc(waitingFor(g, pr.seat, "lighten their sack"))}</p>
      </div>`;
    } else if (pr?.type === "yoinkPick") {
      if (me && pr.seat === me.seat) {
        hide();
        return;
      }
      key = "yoink:" + pr.seat + ":" + (pr.fromSeat ?? "") + ":" + (pr.cards || []).map((c) => c.uid).join(",");
      mine = false;
      html = `<div class="board-prompt">
        <h2>Yoink!</h2>
        <p>${esc(waitingFor(g, pr.seat, "steal a card"))}</p>
      </div>`;
    } else {
      hide();
      return;
    }

    if (waitForBanner && state.turnBannerUntil && Date.now() < state.turnBannerUntil) {
      if (state.boardPromptKey) {
        layer.classList.remove("show", "interactive");
        layer.innerHTML = "";
        state.boardPromptKey = "";
      }
      clearTimeout(state.boardPromptWait);
      const wait = state.turnBannerUntil - Date.now() + 30;
      state.boardPromptWait = setTimeout(() => {
        const root = document.getElementById("tableRoot");
        if (root && state.game) maybeBoardPrompt(state.game, root.querySelector("#promptLayer"));
      }, wait);
      return;
    }
    if (state.boardPromptKey === key) {
      layer.classList.toggle("interactive", mine);
      return;
    }
    state.boardPromptKey = key;
    layer.innerHTML = html;
    bind(layer);
    layer.classList.add("show");
    layer.classList.toggle("interactive", mine);
  }

  function updatePromptActs(g, me, box) {
    if (!box) return;
    box.innerHTML = "";
    const pr = g.prompt;
    if (state.targeting) {
      const b = el(`<button class="danger" type="button">Cancel</button>`);
      b.onclick = () => { state.targeting = null; render(); };
      box.appendChild(b);
      return;
    }
    if (pr?.type === "kittyMove" && pr.canStop && me && pr.seat === me.seat) {
      const b = el(`<button type="button">Stop moving cat</button>`);
      b.onclick = () => act({ type: "kittyMove", stop: true });
      box.appendChild(b);
    }
  }

  function updateRace(g, layer) {
    if (!layer) return;
    const r = g.reaction;
    const race = r && (r.type === "double" || r.type === "cup");
    const me = g.players.find((p) => p.id === state.playerId) || g.players.find((p) => p.seat === g.viewerSeat);
    if (!race) {
      layer.innerHTML = "";
      layer.classList.remove("show");
      state.raceKey = "";
      return;
    }
    const key = r.type + ":" + (r.startedAt || r.endsAt) + ":" + Math.round(r.spot?.x || 0) + ":" + Math.round(r.spot?.y || 0);
    const inRace = !!(me && me.status === "active");
    const clicked = !!(inRace && r.clicks && r.clicks[me.seat] != null);
    if (state.raceKey === key) {
      const btn = layer.querySelector(".race-btn");
      if (btn) btn.classList.toggle("clicked", clicked);
      return;
    }
    state.raceKey = key;
    layer.classList.add("show");
    layer.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "race-btn" + (clicked ? " clicked" : "") + (inRace ? "" : " spectate");
    btn.innerHTML = `<span class="paw-print">
      <svg class="paw-svg" viewBox="0 0 240 260" aria-hidden="true">
        <defs>
          <radialGradient id="pawBean" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stop-color="#f8c4ce"/>
            <stop offset="42%" stop-color="#e48a9a"/>
            <stop offset="78%" stop-color="#b44d62"/>
            <stop offset="100%" stop-color="#3a1c14"/>
          </radialGradient>
        </defs>
        <g fill="url(#pawBean)" stroke="#2a1610" stroke-width="8" stroke-linejoin="round">
          <ellipse cx="48" cy="82" rx="30" ry="38" transform="rotate(-32 48 82)"/>
          <ellipse cx="90" cy="48" rx="30" ry="40" transform="rotate(-11 90 48)"/>
          <ellipse cx="150" cy="48" rx="30" ry="40" transform="rotate(11 150 48)"/>
          <ellipse cx="192" cy="82" rx="30" ry="38" transform="rotate(32 192 82)"/>
          <path d="M58 148c-3-34 34-44 62-44s65 10 62 44c10 24-6 50-34 60-16 8-40 8-56 0-28-10-44-36-34-60z"/>
        </g>
      </svg>
      <span class="paw-label">${r.type === "double" ? "DOUBLE!" : "IN THE CUP"}</span>
    </span>`;
    btn.style.left = (r.spot?.x ?? 50) + "%";
    btn.style.top = (r.spot?.y ?? 50) + "%";
    if (inRace) {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.classList.contains("clicked")) return;
        act({ type: "react", react: r.type });
      };
    } else {
      btn.disabled = true;
    }
    layer.appendChild(btn);
  }

  function viewSide(g, me) {
    const sc = el(`<div class="side-scroll" id="sideScroll"></div>`);

    if (g.prompt?.type === "pickCharacter" && me && g.prompt.seat === me.seat) {
      const box = el(`<div class="me-card"><h3>Choose a class</h3><div class="char-pick"></div></div>`);
      const pick = box.querySelector(".char-pick");
      (g.characters || []).filter((c) => g.prompt.options.includes(c.id)).forEach((c) => {
        const card = el(`<div class="card" style="border-color:${CHAR_COLOR[c.id]}">
          ${c.portrait ? `<img class="portrait sm" src="${c.portrait}" alt="${esc(c.name)}" />` : ""}
          <div>
          <div class="name">${esc(c.name)}</div>
          <div class="meta">${esc(c.className)}</div>
          <div class="vitals char-stats">
            <span class="vital" title="Hit points">${iconHeart()}<b>${c.health}</b></span>
            <span class="vital" title="Might">${iconFist()}<b>${c.might}</b></span>
            <span class="vital" title="Guile">${iconSpark()}<b>${c.guile}</b></span>
            <span class="vital" title="Strength — max loot cards">${iconSack()}<b>${c.strength}</b></span>
          </div>
          <div class="meta">${esc(c.abilityText || "")}</div>
          </div>
        </div>`);
        card.onclick = () => act({ type: "pickCharacter", characterId: c.id });
        pick.appendChild(card);
      });
      sc.appendChild(box);
    }

    if (me) {
      const ch = (g.characters || []).find((c) => c.id === me.characterId);
      const art = ch && ch.portrait;
      const mine = el(`<div class="me-card ${g.phase === "play" && me.seat === g.turnSeat ? "turn-active turn-yours" : ""} ${me.status === "dead" ? "dead" : ""}" style="${panelStyle(ch, me.status === "dead")}">
        <div class="player-row">
          ${art ? `<img class="portrait" src="${art}" alt="${esc(playerLabel(me, ch))}" />` : ""}
          <div class="info">
            ${playerHeading(me, ch)}
            ${playerStats(me)}
            ${me.value != null ? `<div class="meta">${me.value} gp</div>` : ""}
            ${ch && ch.abilityText ? `<div class="meta">${esc(ch.abilityText)}</div>` : ""}
            ${hpBar(me)}
          </div>
        </div>
        ${handTrayHtml(me.seat)}
      </div>`);
      bindHandTray(mine, g, me, me);
      sc.appendChild(mine);
    }

    g.players.filter((p) => !me || p.id !== me.id).forEach((p) => {
      const ch = (g.characters || []).find((c) => c.id === p.characterId);
      const art = ch && ch.portrait;
      const card = el(`<div class="opp ${g.phase === "play" && p.seat === g.turnSeat ? "turn-active" : ""} ${p.status === "dead" ? "dead" : ""}" style="${panelStyle(ch, p.status === "dead")}">
        <div class="player-row">
          ${art ? `<img class="portrait sm" src="${art}" alt="${esc(playerLabel(p, ch))}" />` : ""}
          <div class="info">
            ${playerHeading(p, ch)}
            <div class="meta">${ch ? esc(ch.className) : "—"}</div>
            ${playerStats(p)}
            ${hpBar(p)}
          </div>
        </div>
        ${handTrayHtml(p.seat)}
      </div>`);
      bindHandTray(card, g, me, p);
      sc.appendChild(card);
    });
    return sc;
  }

  function logLineClass(line) {
    const t = line.text || "";
    if (/^— /.test(t) || /'s turn —/.test(t)) return "turn";
    if (/Wound|eliminat|strikes|hurt|wins \(|Baby dragonfire|The Dragon wins/i.test(t)) return "wound";
    if (/loots |Treasure pile|gp\b/i.test(t)) return "loot";
    if (/faces |beats |defeated |vs /i.test(t)) return "combat";
    return "";
  }

  function updateChronicle(g, root) {
    const pane = root.querySelector("#gameLog");
    const meta = root.querySelector("#chronicleMeta");
    if (!pane) return;
    if (meta) {
      meta.textContent = `Round ${g.round} · Hoard ${g.treasureCount} · Loot ${g.lootDeck}`;
    }
    const lines = g.log || [];
    const key = lines.map((l) => l.n).join(",") + ":" + lines.length;
    const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 28;
    const stick = nearBottom || !pane.dataset.ready || state.logKey === "";
    if (state.logKey === key && pane.childElementCount) return;
    state.logKey = key;
    pane.innerHTML = "";
    if (!lines.length) {
      pane.appendChild(el(`<div class="log-line empty">The den is quiet. Play will be written here.</div>`));
    } else {
      lines.forEach((line) => {
        const kind = logLineClass(line);
        const cls = ["log-line", kind].filter(Boolean).join(" ");
        const row = el(`<div class="${cls}">${esc(line.text)}</div>`);
        if (line.seat != null) {
          const p = g.players.find((x) => x.seat === line.seat);
          const color = CHAR_COLOR[p?.characterId];
          if (color && kind !== "turn") row.style.borderLeftColor = color;
        }
        pane.appendChild(row);
      });
    }
    if (stick) {
      pane.scrollTop = pane.scrollHeight;
      pane.dataset.ready = "1";
    }
  }

  function handTrayHtml(seat) {
    return `<div class="hand-hover" data-seat="${seat}"><div class="hand-tray"></div></div>`;
  }

  function sortByKind(list) {
    return (list || []).slice().sort((a, b) => {
      const aa = a.kind === "scroll" ? 1 : 0;
      const bb = b.kind === "scroll" ? 1 : 0;
      return aa - bb;
    });
  }

  function outlinesOf(p) {
    let list;
    if (p.handOutlines && p.handOutlines.length) list = p.handOutlines;
    else if (p.hand && p.hand.length) {
      list = p.hand.map((c) => ({ kind: c.kind === "scroll" ? "scroll" : "treasure", uid: c.uid }));
    } else {
      const n = p.handCount || 0;
      list = Array.from({ length: n }, () => ({ kind: "treasure", uid: null }));
    }
    return sortByKind(list);
  }

  function pickViewerHead(g, view) {
    if (!view || !view.locked || !g.prompt) return null;
    const t = g.prompt.type;
    if (t === "overCarry") return { title: "Sack full", text: "Use or discard loot until you can carry it." };
    if (t === "yoinkPick") return { title: "Yoink!", text: g.prompt.text || "Steal a card." };
    if (t === "discardEnc" || t === "discardItem") return { title: "Discard", text: g.prompt.text || "Choose a card to discard." };
    if (t === "passTreasure") return { title: "Pass treasure", text: g.prompt.text || "Choose a card to pass." };
    return null;
  }

  function cardNeedsPick(g, me) {
    if (!me || !g.prompt || g.prompt.seat !== me.seat) return null;
    const t = g.prompt.type;
    if (t === "overCarry" || t === "discardEnc" || t === "discardItem" || t === "passTreasure") {
      return { seat: me.seat, locked: true };
    }
    if (t === "yoinkPick") return { seat: g.prompt.fromSeat, locked: true };
    return null;
  }

  function cardsForViewer(g, me, view) {
    if (!view) return [];
    if (g.prompt?.type === "yoinkPick" && g.prompt.seat === me?.seat && view.locked) {
      return sortByKind(g.prompt.cards || []);
    }
    const owner = (g.players || []).find((p) => p.seat === view.seat);
    if (!owner) return [];
    return sortByKind(owner.hand || owner.peekHand || []);
  }

  function closeHoverViewer() {
    if (!state.handView || state.handView.locked) return;
    state.handView = null;
    state.handViewKey = "";
    document.querySelectorAll(".hand-viewer.hover-pop").forEach((n) => n.remove());
    const layer = document.getElementById("handViewerLayer");
    if (layer) {
      layer.hidden = true;
      layer.innerHTML = "";
      layer.classList.remove("peek", "docked", "locked-pick");
    }
  }

  function cardSelectable(g, me, c) {
    if (!me || !c || g.prompt?.seat !== me.seat) return false;
    const t = g.prompt.type;
    if (t === "overCarry") return true;
    if (t === "discardEnc") return true;
    if (t === "discardItem") {
      if ((g.prompt.kind === "Item" || g.prompt.kind === "Treasure") && c.kind !== "treasure" && c.kind !== "scroll") return false;
      return true;
    }
    if (t === "passTreasure") return c.kind === "treasure" || c.kind === "scroll";
    if (t === "yoinkPick") return true;
    return false;
  }

  function cardPlayable(g, me, c) {
    return !!(canPlayScroll(g, me, c) || (g.prompt?.canSacrifice && g.prompt.seat === me?.seat && g.prompt.type === "combat"));
  }

  function bindHandTray(root, g, me, owner) {
    const tray = root.querySelector(".hand-tray");
    if (!tray) return;
    const outlines = outlinesOf(owner);
    if (!outlines.length) {
      tray.hidden = true;
      return;
    }
    outlines.forEach((o) => {
      const chip = el(`<span class="hand-chip ${o.kind === "scroll" ? "scroll" : "treasure"}"></span>`);
      const full = (owner.hand || owner.peekHand || []).find((c) => c.uid === o.uid);
      if (full && me && owner.seat === me.seat && cardPlayable(g, me, full)) {
        chip.classList.add("pulse");
      }
      tray.appendChild(chip);
    });
    const wrap = root.querySelector(".hand-hover");
    const canPeek = outlines.length > 0;
    if (canPeek && wrap) {
      wrap.onmouseenter = () => {
        if (state.targeting) return;
        if (state.handView && (state.handView.locked || !state.handView.hover)) return;
        state.handView = { seat: owner.seat, locked: false, hover: true };
        syncHandViewer(g, me);
      };
      wrap.onmouseleave = (e) => {
        const next = e.relatedTarget;
        if (!next || !document.body.contains(next)) return;
        if (wrap.contains(next)) return;
        if (state.handView && state.handView.hover) closeHoverViewer();
      };
      wrap.onclick = (e) => {
        e.stopPropagation();
        if (state.targeting) return;
        if (state.handView && state.handView.locked) return;
        state.handView = { seat: owner.seat, locked: false, hover: false };
        syncHandViewer(g, me);
      };
    }
  }

  function fillLootCard(g, me, c) {
    const card = el(`<div class="card ${c.kind === "scroll" ? "scroll" : ""}">
      <div class="card-art">${lootArt(c.defId)}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="meta"${c.kind === "scroll" && c.text ? ` data-full="${esc(c.text)}"` : ""}>${c.kind === "scroll" ? esc(c.text || "") : (c.value != null ? c.value + " gp" : "")}</div>
      <div class="card-acts"></div>
    </div>`);
    const acts = card.querySelector(".card-acts");
    const addAct = (node) => acts.appendChild(node);
    const mineCard = !!(me && (me.hand || []).some((h) => h.uid === c.uid));
    const yoinking = g.prompt?.type === "yoinkPick" && g.prompt.seat === me?.seat;
    const usable = (mineCard || yoinking) && (cardPlayable(g, me, c) || cardSelectable(g, me, c));
    if (usable) card.classList.add("pulse");
    if (!mineCard && !yoinking) return card;
    if (g.prompt?.type === "overCarry" && g.prompt.seat === me?.seat) {
      if (c.kind === "scroll" && c.timing !== "fork") {
        const use = el(`<button type="button">Use</button>`);
        use.onclick = (e) => { e.stopPropagation(); playScroll(g, me, c); };
        addAct(use);
      }
      const d = el(`<button class="danger" type="button">Discard</button>`);
      d.onclick = (e) => { e.stopPropagation(); act({ type: "overCarry", uid: c.uid }); };
      addAct(d);
    } else if (g.prompt && ["discardEnc", "discardItem", "passTreasure"].includes(g.prompt.type) && g.prompt.seat === me?.seat) {
      if (cardSelectable(g, me, c)) {
        const b = el(`<button type="button">Choose</button>`);
        b.onclick = (e) => { e.stopPropagation(); act({ type: g.prompt.type, uid: c.uid }); };
        addAct(b);
      }
    } else if (g.prompt?.type === "yoinkPick" && g.prompt.seat === me?.seat) {
      const b = el(`<button type="button">Steal</button>`);
      b.onclick = (e) => { e.stopPropagation(); act({ type: "yoinkPick", uid: c.uid }); };
      addAct(b);
    } else if (canPlayScroll(g, me, c)) {
      const b = el(`<button type="button">Play</button>`);
      b.onclick = (e) => { e.stopPropagation(); playScroll(g, me, c); };
      addAct(b);
    }
    const canSac = !!(g.prompt?.canSacrifice && g.prompt.seat === me?.seat && g.prompt.type === "combat");
    if (canSac && !["overCarry", "discardEnc", "discardItem", "passTreasure"].includes(g.prompt?.type)) {
      const s = el(`<button class="danger" type="button">Sacrifice</button>`);
      s.onclick = (e) => { e.stopPropagation(); act({ type: "sacrificeLoot", uid: c.uid }); };
      addAct(s);
    }
    return card;
  }

  function dockHandViewer(box, seat) {
    const wrap = document.querySelector(`.hand-hover[data-seat="${seat}"]`);
    const panel = wrap && wrap.closest(".me-card, .opp");
    const anchor = panel || wrap;
    if (!box || !anchor) return;
    box.classList.add("docked");
    const r = anchor.getBoundingClientRect();
    box.style.position = "fixed";
    box.style.margin = "0";
    box.style.left = "auto";
    box.style.bottom = "auto";
    box.style.right = Math.max(8, window.innerWidth - r.left + 8) + "px";
    box.style.top = Math.max(8, r.top) + "px";
    const br = box.getBoundingClientRect();
    if (br.bottom > window.innerHeight - 8) {
      box.style.top = Math.max(8, window.innerHeight - br.height - 8) + "px";
    }
    if (br.left < 8) {
      box.style.right = "auto";
      box.style.left = "8px";
      box.style.maxWidth = Math.max(120, r.left - 16) + "px";
    }
  }

  function syncHandViewer(g, me, root) {
    root = root || document.getElementById("tableRoot");
    const layer = root && root.querySelector("#handViewerLayer");
    if (!layer) return;
    document.querySelectorAll(".hand-viewer.hover-pop").forEach((n) => n.remove());
    if (state.targeting) {
      layer.hidden = true;
      layer.innerHTML = "";
      layer.classList.remove("peek", "docked", "locked-pick");
      if (state.handView && !state.handView.locked) {
        state.handView = null;
        state.handViewKey = "";
      }
      return;
    }
    const forced = cardNeedsPick(g, me);
    if (forced) state.handView = forced;
    else if (state.handView && state.handView.locked) state.handView = null;
    const view = state.handView;
    if (!view) {
      layer.hidden = true;
      layer.innerHTML = "";
      layer.classList.remove("peek", "docked", "locked-pick");
      state.handViewKey = "";
      return;
    }
    const cards = cardsForViewer(g, me, view);
    if (!cards.length && !view.locked) {
      closeHoverViewer();
      return;
    }
    const flags = cards.map((c) => (cardPlayable(g, me, c) ? "p" : "") + (cardSelectable(g, me, c) ? "s" : "")).join("");
    const key = [view.seat, view.locked ? 1 : 0, view.hover ? "h" : "c", g.prompt?.type || "", g.prompt?.cap || "", cards.map((c) => c.uid).join(","), flags].join(":");
    const peek = !!(view.hover && !view.locked);
    const docked = !view.locked;
    layer.classList.toggle("peek", peek);
    layer.classList.toggle("docked", docked);
    layer.classList.toggle("locked-pick", !!view.locked);
    if (state.handViewKey === key && layer.childElementCount) {
      layer.hidden = false;
      if (docked) dockHandViewer(layer.querySelector(".hand-viewer"), view.seat);
      return;
    }
    state.handViewKey = key;
    layer.innerHTML = "";
    const box = el(`<div class="hand-viewer${view.locked ? " has-head" : ""}"></div>`);
    const head = pickViewerHead(g, view);
    if (head) {
      box.appendChild(el(`<div class="hand-viewer-head"><h2>${esc(head.title)}</h2><p>${esc(head.text)}</p></div>`));
    }
    const row = el(`<div class="hand-viewer-cards"></div>`);
    if (!cards.length) {
      row.appendChild(el(`<p class="muted">No cards to show.</p>`));
    } else {
      cards.forEach((c) => row.appendChild(fillLootCard(g, me, c)));
    }
    box.appendChild(row);
    box.onclick = (e) => e.stopPropagation();
    layer.appendChild(box);
    layer.hidden = false;
    layer.onclick = () => {
      if (state.handView && state.handView.locked) return;
      closeHoverViewer();
    };
    if (docked) dockHandViewer(box, view.seat);
  }

  function canPlayScroll(g, me, c) {
    if (!me || c.kind !== "scroll" || g.prompt?.seat !== me.seat) return false;
    if (!(me.hand || []).some((h) => h.uid === c.uid)) return false;
    if (c.timing === "fork") return false;
    if (g.prompt.type === "overCarry") return true;
    if (c.timing === "combat") return g.prompt.type === "combat" || g.prompt.type === "dragon";
    if (c.timing === "preMove") return g.prompt.type === "preMove";
    if (c.timing === "turn") return ["preMove", "combat", "dragon"].includes(g.prompt.type);
    return false;
  }

  function playScroll(g, me, c) {
    const needPlayer = ["munchies", "nectar", "yoink", "trashing", "over_there", "impede", "everyone"].includes(c.defId);
    const needRoom = c.defId === "empty" || c.defId === "missed";
    const needCombatant = ["destrong", "desmart", "enstrong", "ensmart"].includes(c.defId);
    if (needPlayer) {
      state.targeting = { card: c, kind: "player" };
      render();
      return;
    }
    if (needRoom) {
      state.targeting = { card: c, kind: "room" };
      render();
      return;
    }
    if (needCombatant) {
      state.targeting = { card: c, kind: "combatant" };
      render();
      return;
    }
    act({ type: "playScroll", uid: c.uid, defId: c.defId });
  }

  render();
})();
