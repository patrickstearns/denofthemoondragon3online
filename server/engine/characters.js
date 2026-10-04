/** Character roster: [Health, Strength, Might, Guile]. Strength is max loot cards. */

const CHARACTERS = [
  {
    id: "cleric",
    className: "Cleric",
    name: "Clarice",
    health: 10,
    strength: 4,
    might: 2,
    guile: 3,
    color: "#e8d48b",
    portrait: "/assets/portraits/clarice.png?v=cartoon",
    ability: null,
    flavor: "She will heal you. For a price. The price is usually your share.",
  },
  {
    id: "wizard",
    className: "Wizard",
    name: "Wanda",
    health: 4,
    strength: 7,
    might: 3,
    guile: 5,
    color: "#7ec8e3",
    portrait: "/assets/portraits/wanda.png?v=cartoon",
    ability: null,
    flavor: "Knows seven words for 'fire' and zero for 'sharing'.",
  },
  {
    id: "rogue",
    className: "Rogue",
    name: "Rollo",
    health: 7,
    strength: 10,
    might: 2,
    guile: 4,
    color: "#9ad89a",
    portrait: "/assets/portraits/rollo.png?v=cartoon",
    ability: "rogue_move",
    abilityText: "+1 to Movement each turn",
    flavor: "If it isn't nailed down, it is already in his bag. If it is nailed down, give him a minute.",
  },
  {
    id: "barbarian",
    className: "Barbarian",
    name: "Barry",
    health: 5,
    strength: 7,
    might: 4,
    guile: 2,
    color: "#e07a5f",
    portrait: "/assets/portraits/barry.png?v=cartoon",
    ability: "barbarian_ignore",
    abilityText: "Ignore the first hit you take each round",
    flavor: "Hits first. Thinks later. Rarely later.",
  },
];

function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

module.exports = { CHARACTERS, getCharacter };
