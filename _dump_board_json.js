const fs = require("fs");
const path = require("path");
const { BOARD } = require("./server/engine/board");

const data = {
  spaces: Object.values(BOARD.spaces).map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    type: s.type,
    red: s.red || 0,
    yellow: s.yellow || 0,
    next: [...s.next],
  })),
  catSpawns: { ...BOARD.catSpawns },
  startId: BOARD.startId,
  dragonId: BOARD.dragonId,
};

fs.writeFileSync(
  path.join(__dirname, "server", "engine", "board-data.json"),
  JSON.stringify(data, null, 2)
);
console.log("wrote board-data.json", data.spaces.length, "spaces");
