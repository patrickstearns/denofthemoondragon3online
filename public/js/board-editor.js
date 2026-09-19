(() => {
  const frame = document.getElementById("frame");
  const marksEl = document.getElementById("marks");
  const linesEl = document.getElementById("linkLines");
  const ghost = document.getElementById("ghost");
  const statusEl = document.getElementById("status");
  const statsEl = document.getElementById("stats");
  const selFields = document.getElementById("selFields");
  const noneSel = document.getElementById("noneSel");

  const state = {
    spaces: [],
    catSpawns: { angel: "", alex: "", lily: "" },
    startId: "start",
    dragonId: "dragon",
    mode: "place",
    selected: null,
    linkFrom: null,
    lastPlaced: null,
    undo: [],
    dragging: null,
  };

  const byId = () => Object.fromEntries(state.spaces.map((s) => [s.id, s]));

  function status(msg, err) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("err", !!err);
  }

  function snapshot() {
    state.undo.push(JSON.stringify({
      spaces: state.spaces,
      catSpawns: state.catSpawns,
      startId: state.startId,
      dragonId: state.dragonId,
    }));
    if (state.undo.length > 80) state.undo.shift();
  }

  function restore(raw) {
    const d = JSON.parse(raw);
    state.spaces = d.spaces || [];
    state.catSpawns = d.catSpawns || { angel: "", alex: "", lily: "" };
    state.startId = d.startId || "start";
    state.dragonId = d.dragonId || "dragon";
    state.selected = null;
    state.linkFrom = null;
    state.lastPlaced = null;
    render();
    persistDraft();
  }

  function persistDraft() {
    localStorage.setItem("dd3-board-draft", JSON.stringify(payload()));
  }

  function payload() {
    return {
      spaces: state.spaces.map((s) => ({
        id: s.id,
        x: round(s.x),
        y: round(s.y),
        type: s.type,
        red: +s.red || 0,
        yellow: +s.yellow || 0,
        next: [...s.next],
      })),
      catSpawns: { ...state.catSpawns },
      startId: state.startId,
      dragonId: state.dragonId,
    };
  }

  function round(n) {
    return Math.round(+n * 10) / 10;
  }

  function uniqueId(want) {
    const used = byId();
    if (!used[want]) return want;
    let i = 2;
    while (used[want + "_" + i]) i++;
    return want + "_" + i;
  }

  function nextId(type) {
    if (type === "start") return uniqueId("start");
    if (type === "dragon") return uniqueId("dragon");
    const prefix = type === "room" ? "r" : "p";
    const used = byId();
    let i = 1;
    while (used[prefix + i]) i++;
    return prefix + i;
  }

  function pctFromEvent(e) {
    const r = frame.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }

  function nearest(x, y, max = 1.6) {
    let best = null;
    let bestD = max;
    for (const s of state.spaces) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  function renameSpace(oldId, newId) {
    if (oldId === newId) return true;
    if (!newId || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(newId)) {
      status("Ids must start with a letter.", true);
      return false;
    }
    if (byId()[newId]) {
      status("That id is already used.", true);
      return false;
    }
    snapshot();
    const sp = byId()[oldId];
    sp.id = newId;
    for (const o of state.spaces) {
      o.next = o.next.map((n) => (n === oldId ? newId : n));
    }
    for (const k of Object.keys(state.catSpawns)) {
      if (state.catSpawns[k] === oldId) state.catSpawns[k] = newId;
    }
    if (state.startId === oldId) state.startId = newId;
    if (state.dragonId === oldId) state.dragonId = newId;
    if (state.selected === oldId) state.selected = newId;
    if (state.lastPlaced === oldId) state.lastPlaced = newId;
    return true;
  }

  function addLink(a, b) {
    if (!a || !b || a === b) return;
    const from = byId()[a];
    if (!from || !byId()[b]) return;
    if (!from.next.includes(b)) from.next.push(b);
  }

  function dropLink(a, b) {
    const from = byId()[a];
    if (!from) return;
    from.next = from.next.filter((n) => n !== b);
  }

  function addSpace(x, y) {
    snapshot();
    const type = document.getElementById("newType").value;
    const id = nextId(type);
    const sp = { id, x: round(x), y: round(y), type, red: 0, yellow: 0, next: [] };
    if (type === "start") state.startId = id;
    if (type === "dragon") state.dragonId = id;
    state.spaces.push(sp);
    if (document.getElementById("chain").checked && state.lastPlaced && byId()[state.lastPlaced]) {
      addLink(state.lastPlaced, id);
    }
    state.lastPlaced = id;
    state.selected = id;
    render();
    persistDraft();
  }

  function deleteSelected() {
    if (!state.selected) return;
    snapshot();
    const id = state.selected;
    state.spaces = state.spaces.filter((s) => s.id !== id);
    for (const s of state.spaces) s.next = s.next.filter((n) => n !== id);
    for (const k of Object.keys(state.catSpawns)) {
      if (state.catSpawns[k] === id) state.catSpawns[k] = "";
    }
    if (state.lastPlaced === id) state.lastPlaced = null;
    state.selected = null;
    render();
    persistDraft();
  }

  function drawLinks() {
    const map = byId();
    linesEl.innerHTML = "";
    for (const s of state.spaces) {
      for (const n of s.next) {
        const t = map[n];
        if (!t) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", s.x);
        line.setAttribute("y1", s.y);
        line.setAttribute("x2", t.x);
        line.setAttribute("y2", t.y);
        linesEl.appendChild(line);
      }
    }
  }

  function render() {
    drawLinks();
    const catAt = new Set(Object.values(state.catSpawns).filter(Boolean));
    marksEl.innerHTML = "";
    for (const s of state.spaces) {
      const el = document.createElement("div");
      el.className = "mark " + s.type + (s.id === state.selected ? " sel" : "") + (catAt.has(s.id) ? " cat" : "");
      el.style.left = s.x + "%";
      el.style.top = s.y + "%";
      el.dataset.id = s.id;
      const lab = document.createElement("span");
      lab.className = "lab";
      lab.textContent = s.id;
      el.appendChild(lab);
      el.addEventListener("pointerdown", onMarkDown);
      marksEl.appendChild(el);
    }

    document.body.classList.toggle("hide-labs", !document.getElementById("labels").checked);

    const rooms = state.spaces.filter((s) => s.type === "room").length;
    const links = state.spaces.reduce((n, s) => n + s.next.length, 0);
    statsEl.textContent = `${state.spaces.length} spaces · ${rooms} rooms · ${links} links`;

    fillCatSelects();
    renderSel();
  }

  function fillCatSelects() {
    const opts = ['<option value="">—</option>'].concat(
      state.spaces.map((s) => `<option value="${s.id}">${s.id}</option>`)
    ).join("");
    for (const [key, elId] of [["angel", "catAngel"], ["alex", "catAlex"], ["lily", "catLily"]]) {
      const el = document.getElementById(elId);
      const cur = state.catSpawns[key] || "";
      el.innerHTML = opts;
      el.value = cur;
    }
  }

  function renderSel() {
    const s = byId()[state.selected];
    noneSel.hidden = !!s;
    selFields.hidden = !s;
    if (!s) return;
    document.getElementById("selId").value = s.id;
    document.getElementById("selType").value = s.type;
    document.getElementById("selX").value = s.x;
    document.getElementById("selY").value = s.y;
    document.getElementById("selRed").value = s.red || 0;
    document.getElementById("selYellow").value = s.yellow || 0;
    document.getElementById("selNext").textContent = s.next.length
      ? "Exits → " + s.next.join(", ")
      : "No player exits yet.";
  }

  function onMarkDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const sp = byId()[id];
    if (!sp) return;

    if (state.mode === "link") {
      if (!state.linkFrom) {
        state.linkFrom = id;
        state.selected = id;
        render();
        status("Now click the next space (diamond direction).");
      } else {
        snapshot();
        addLink(state.linkFrom, id);
        state.linkFrom = id;
        state.selected = id;
        state.lastPlaced = id;
        ghost.setAttribute("hidden", "");
        render();
        persistDraft();
        status("Linked. Click the next tile, or Esc to stop.");
      }
      return;
    }

    if (state.mode === "unlink") {
      if (!state.linkFrom) {
        state.linkFrom = id;
        state.selected = id;
        render();
        status("Click the space to disconnect.");
      } else {
        snapshot();
        dropLink(state.linkFrom, id);
        dropLink(id, state.linkFrom);
        state.linkFrom = null;
        ghost.setAttribute("hidden", "");
        render();
        persistDraft();
        status("Unlinked.");
      }
      return;
    }

    state.selected = id;
    state.lastPlaced = id;
    state.linkFrom = null;
    render();

    const start = pctFromEvent(e);
    state.dragging = { id, x0: start.x, y0: start.y, ox: sp.x, oy: sp.y, moved: false, snapped: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  frame.addEventListener("pointermove", (e) => {
    const p = pctFromEvent(e);
    if (state.dragging) {
      const dx = p.x - state.dragging.x0;
      const dy = p.y - state.dragging.y0;
      if (!state.dragging.moved && Math.hypot(dx, dy) < 0.35) return;
      if (!state.dragging.moved) {
        snapshot();
        state.dragging.moved = true;
      }
      const sp = byId()[state.dragging.id];
      if (!sp) return;
      sp.x = round(state.dragging.ox + dx);
      sp.y = round(state.dragging.oy + dy);
      const el = marksEl.querySelector(`[data-id="${sp.id}"]`);
      if (el) {
        el.style.left = sp.x + "%";
        el.style.top = sp.y + "%";
      }
      drawLinks();
      document.getElementById("selX").value = sp.x;
      document.getElementById("selY").value = sp.y;
      return;
    }
    if ((state.mode === "link" || state.mode === "unlink") && state.linkFrom) {
      const from = byId()[state.linkFrom];
      if (!from) return;
      ghost.removeAttribute("hidden");
      ghost.setAttribute("x1", from.x);
      ghost.setAttribute("y1", from.y);
      ghost.setAttribute("x2", p.x);
      ghost.setAttribute("y2", p.y);
    }
  });

  window.addEventListener("pointerup", () => {
    if (state.dragging) {
      if (state.dragging.moved) persistDraft();
      state.dragging = null;
    }
  });

  frame.addEventListener("pointerdown", (e) => {
    if (e.target !== frame && e.target !== document.getElementById("linkSvg") && e.target !== document.getElementById("boardImg")) {
      if (e.target.closest(".mark")) return;
    }
    const p = pctFromEvent(e);
    if (state.mode === "place") {
      const hit = nearest(p.x, p.y, 1.3);
      if (hit) {
        state.selected = hit.id;
        state.lastPlaced = hit.id;
        render();
        return;
      }
      addSpace(p.x, p.y);
      return;
    }
    const hit = nearest(p.x, p.y, 1.6);
    if (hit) {
      const ev = { preventDefault() {}, stopPropagation() {}, currentTarget: { dataset: { id: hit.id } }, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
      onMarkDown(ev);
    }
  });

  document.getElementById("modes").onclick = (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    state.linkFrom = null;
    ghost.setAttribute("hidden", "");
    document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b === btn));
    status(state.mode === "place" ? "Click tiles to place." : state.mode === "link" ? "Click along a path in diamond order." : "Click two spaces to drop their link.");
  };

  document.getElementById("labels").onchange = () => render();
  document.getElementById("chain").onchange = () => {
    state.lastPlaced = state.selected;
  };

  document.getElementById("selId").onchange = (e) => {
    if (!state.selected) return;
    if (renameSpace(state.selected, e.target.value.trim())) {
      render();
      persistDraft();
    } else renderSel();
  };
  document.getElementById("selType").onchange = (e) => {
    const s = byId()[state.selected];
    if (!s) return;
    snapshot();
    s.type = e.target.value;
    if (s.type === "start") state.startId = s.id;
    if (s.type === "dragon") state.dragonId = s.id;
    render();
    persistDraft();
  };
  for (const [id, key] of [["selX", "x"], ["selY", "y"], ["selRed", "red"], ["selYellow", "yellow"]]) {
    document.getElementById(id).onchange = (e) => {
      const s = byId()[state.selected];
      if (!s) return;
      snapshot();
      s[key] = +e.target.value;
      render();
      persistDraft();
    };
  }
  document.getElementById("delSel").onclick = deleteSelected;

  for (const [key, elId] of [["angel", "catAngel"], ["alex", "catAlex"], ["lily", "catLily"]]) {
    document.getElementById(elId).onchange = (e) => {
      snapshot();
      state.catSpawns[key] = e.target.value;
      render();
      persistDraft();
    };
  }

  document.getElementById("undo").onclick = () => {
    const prev = state.undo.pop();
    if (!prev) return status("Nothing to undo.", true);
    const keep = state.undo;
    restore(prev);
    state.undo = keep;
  };

  document.getElementById("blank").onclick = () => {
    if (!confirm("Clear every space?")) return;
    snapshot();
    state.spaces = [];
    state.catSpawns = { angel: "", alex: "", lily: "" };
    state.selected = null;
    state.lastPlaced = null;
    render();
    persistDraft();
    status("Blank board. Click each tile.");
  };

  document.getElementById("loadLive").onclick = async () => {
    const res = await fetch("/api/board");
    const data = await res.json();
    snapshot();
    state.spaces = data.spaces || [];
    state.catSpawns = data.catSpawns || { angel: "", alex: "", lily: "" };
    state.startId = data.startId || "start";
    state.dragonId = data.dragonId || "dragon";
    state.selected = null;
    render();
    persistDraft();
    status("Loaded the live game board.");
  };

  document.getElementById("save").onclick = async () => {
    const body = payload();
    const starts = body.spaces.filter((s) => s.type === "start");
    const dragons = body.spaces.filter((s) => s.type === "dragon");
    if (starts.length !== 1 || dragons.length !== 1) {
      status("Need exactly one Start and one Dragon before saving.", true);
      return;
    }
    body.startId = starts[0].id;
    body.dragonId = dragons[0].id;
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Save failed");
      status(`Saved ${out.spaces} spaces. New tables will use this map.`);
    } catch (err) {
      status(err.message, true);
    }
  };

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    if (e.key === "Escape") {
      state.linkFrom = null;
      state.lastPlaced = null;
      ghost.setAttribute("hidden", "");
      status("Chain / link cancelled.");
      render();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      document.getElementById("undo").click();
    } else if (e.key === "1") {
      document.getElementById("newType").value = "path";
    } else if (e.key === "2") {
      document.getElementById("newType").value = "room";
    }
  });

  async function boot() {
    const draft = localStorage.getItem("dd3-board-draft");
    if (draft) {
      try {
        restore(draft);
        state.undo = [];
        status("Restored your last editor draft. Save to game when the map is right.");
        return;
      } catch (_) { /* ignore */ }
    }
    state.spaces = [];
    render();
    status("Blank map. Click each tile on the art.");
  }

  boot();
})();
