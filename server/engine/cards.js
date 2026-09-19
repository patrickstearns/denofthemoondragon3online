/** Card definitions from Dragon's Den III rules. */

function copies(def, n) {
  return Array.from({ length: n }, () => ({ ...def }));
}

const ROOM_DEFS = [
  { id: "monster_den", name: "Monster Den", copies: 4, cs: 0, reveal: { denizen: 1 }, text: "+1 Denizen chit when revealed.", flavor: "Something lives here. It is not house-trained." },
  { id: "prison_cells", name: "Prison Cells", copies: 1, cs: -2, reveal: {}, text: "−2 Combat Score.", flavor: "The locks still work. The keys do not." },
  { id: "alchemy_lab", name: "Alchemy Lab", copies: 1, cs: -2, reveal: { loot: 1 }, text: "−2 CS. +1 Loot chit when revealed.", flavor: "Do not drink the green one. Or the other one." },
  { id: "gold_smelter", name: "Gold Smelter", copies: 1, cs: 0, reveal: { loot: 2 }, text: "+2 Loot chits when revealed.", flavor: "Hot, loud, and full of other people's gold." },
  { id: "wine_cellar", name: "Wine Cellar", copies: 1, cs: 3, reveal: { loot: 1 }, text: "+3 CS. +1 Loot chit when revealed.", flavor: "Courage in a bottle. Hangover in a denizen." },
  { id: "aux_treasure", name: "Auxiliary Treasure Pile", copies: 2, cs: 0, reveal: { loot: 1 }, text: "+1 Loot chit when revealed.", flavor: "The dragon's rainy-day fund." },
  { id: "torture_room", name: "Torture Room", copies: 1, cs: -2, reveal: {}, text: "−2 CS due to corpses.", flavor: "The decor is very honest." },
  { id: "kitchen", name: "Kitchen", copies: 1, cs: 3, reveal: {}, text: "+3 CS.", flavor: "A good meal and a better knife rack." },
  { id: "lava_baths", name: "Lava Baths", copies: 1, cs: -3, reveal: {}, text: "−3 CS.", flavor: "Relaxing, if you are already on fire." },
  { id: "litter_room", name: "Litter Room", copies: 1, cs: -2, reveal: {}, text: "−2 CS.", flavor: "The smell has a hit bonus." },
  { id: "gaol", name: "Gaol", copies: 1, cs: -1, reveal: { denizen: 1 }, text: "−1 CS. +1 Denizen chit when revealed.", flavor: "Old spelling, older inmates." },
  { id: "fountain", name: "Clear Fountain", copies: 1, cs: 0, reveal: {}, fountain: true, text: "End your turn here: gain 1 health.", flavor: "It looks clean. That is the trick." },
  { id: "corridor", name: "Corridor", copies: 4, cs: 0, reveal: {}, text: "No effect.", flavor: "A hallway with ambition." },
  { id: "statuary_hall", name: "Statuary Hall", copies: 1, cs: 1, reveal: {}, text: "+1 CS.", flavor: "Don't make eye contact. Some of them blink." },
  { id: "zen_room", name: "Zen Room", copies: 1, cs: 0, reveal: { zen: true }, text: "Remove all Denizen and Loot chits when revealed.", flavor: "Inner peace. Outer emptiness." },
  { id: "hot_chicks", name: "Hot Chicks Room", copies: 1, cs: -2, reveal: { loseTreasure: true }, text: "−2 CS. Lose one random Treasure to baby dragonfire.", flavor: "Cute. Molten. Absolutely not." },
  { id: "altar", name: "Sacrificial Altar", copies: 1, cs: -1, reveal: { denizen: 1 }, text: "−1 CS. +1 Denizen when revealed.", flavor: "The groove in the stone is not for soup." },
];

const DENIZEN_DEFS = [
  { id: "hamster", name: "Very Lost Hamster", might: 1, guile: null, use: "might", flavor: "So THIS is where they go!" },
  { id: "sparrow", name: "Dart Sparrow", might: 2, guile: null, use: "might", flavor: "Somebody resurrected it and dipped the beak in metal, and it is pissed." },
  { id: "gobling", name: "Armed Gobling", might: null, guile: 2, use: "guile", flavor: "He might be a kid but that sword'll still kill ya." },
  { id: "ferret", name: "Angry Ferret", might: 2, guile: 2, use: "choose", flavor: "All it knows is hate." },
  { id: "spider", name: "Hand-Sized Spider", might: 3, guile: null, use: "might", flavor: "Sure, they're cute and furry, but, ugh, too many eyes..." },
  { id: "tribble", name: "Feral Tribble", might: 3, guile: null, use: "might", flavor: "All they do is eat and reproduce. Hope they only use you for the first one." },
  { id: "bat_skel", name: "Bat Skeleton", might: null, guile: 3, use: "guile", flavor: "They don't sound all that scary until one's wrapped around your head." },
  { id: "fetus", name: "Undead Fetus", might: null, guile: 3, use: "guile", flavor: "It wants to suck your age out and grow up to be a big strong zombie." },
  { id: "ponycorn", name: "Ponycorn", might: 3, guile: 3, use: "lower", flavor: "You have to control their numbers or they end up starving to death." },
  { id: "oni", name: "Half-Pint Oni", might: 4, guile: null, use: "might", flavor: "The short ones always have something to prove." },
  { id: "cube", name: "Gelatinous Cubeling", might: 4, guile: null, use: "might", flavor: "Cute until they eat your dog, and then your sister, and then your family." },
  { id: "shadow_wolf", name: "Shadow Wolf", might: 4, guile: null, use: "might", flavor: "If this is the shadow, the real thing must be all teeth." },
  { id: "brainflogger", name: "Baby Brainflogger", might: null, guile: 4, use: "guile", flavor: "Hope its mother isn't around." },
  { id: "goblin", name: "Average Goblin", might: null, guile: 4, use: "guile", flavor: "His mother always said he should try harder, but, eh." },
  { id: "kudzu", name: "Kudzu", might: null, guile: 4, use: "guile", flavor: "This crap gets everywhere." },
  { id: "minigolems", name: "Minigolems", might: 4, guile: 4, use: "choose", flavor: "Who MAKES these things?" },
  { id: "pathetivore", name: "Pathetivore", might: null, guile: 5, use: "guile", flavor: "It feeds on pity; best to just stab it right in the face." },
  { id: "unicorn", name: "Sleazy Unicorn", might: null, guile: 5, use: "guile", flavor: "Sure, you can feel it. Just wrap your hand around it and rub it up and down." },
  { id: "beelzeggots", name: "Beelzeggots", might: null, guile: 5, use: "guile", flavor: "It's not just when they molt, it's what they have to feed on." },
  { id: "powersquid", name: "Powersquid", might: null, guile: 5, use: "guile", flavor: "Some theorize it's really a jellyfish. Nobody wants to check." },
  { id: "vorpal", name: "Vorpal Bunny", might: 1, guile: null, use: "might", flavor: "Weak to holy damage and hand grenades." },
  { id: "basalt", name: "Basalt Golem", might: 2, guile: null, use: "might", flavor: "You can get 3 mana if you can figure out how to untap him." },
  { id: "fern", name: "Carnivorous Fern", might: 3, guile: null, use: "might", flavor: "Do not get between two of them." },
  { id: "mink_lich", name: "Mink Lich", might: 4, guile: null, use: "might", flavor: "Only three animals kill for pleasure. This kills all of them." },
  { id: "shadow_daemon", name: "Shadow Daemon", might: 5, guile: 5, use: "lower", flavor: "We all have one..." },
  { id: "pit_lord", name: "Lord of the Pit", might: 7, guile: 7, use: "lower", flavor: "Sacrifice a creature, or... what, you don't have any? Too bad." },
];

const TREASURE_DEFS = [
  { id: "gold1", name: "One Bag o' Gold", copies: 4, value: 100, enc: 1, kind: "treasure" },
  { id: "gold2", name: "Two Bags o' Gold", copies: 3, value: 200, enc: 2, kind: "treasure" },
  { id: "gold3", name: "Three Bags o' Gold", copies: 2, value: 300, enc: 3, kind: "treasure" },
  { id: "chalice", name: "Gold Chalice", copies: 4, value: 200, enc: 1, kind: "treasure" },
  { id: "jewel_chalice", name: "Jewelled Gold Chalice", copies: 2, value: 350, enc: 1, kind: "treasure" },
  { id: "pimp_cup", name: "Pimp Cup", copies: 1, value: 500, enc: 1, kind: "treasure" },
  { id: "music_box", name: "Filigree Music Box", copies: 1, value: 1500, enc: 1, kind: "treasure" },
  { id: "sword", name: "Decorative Sword", copies: 2, value: 200, enc: 3, kind: "treasure" },
  { id: "bishop_ring", name: "Bishops' Ring", copies: 4, value: 400, enc: 1, kind: "treasure" },
  { id: "cardinal_ring", name: "Cardinals' Ring", copies: 2, value: 800, enc: 1, kind: "treasure" },
  { id: "horse", name: "Jewelled Horse Figurine", copies: 1, value: 1000, enc: 1, kind: "treasure" },
];

const SCROLL_DEFS = [
  { id: "munchies", name: "Scroll of Magic Munchies", copies: 2, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "player", text: "Target gains 3 HP." },
  { id: "nectar", name: "Scroll of Sweet Sweet Nectar", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "player", text: "Target gains 5 HP." },
  { id: "yoink", name: "Scroll of Yoink!", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "steal", text: "Steal one Loot card of your choice from another player." },
  { id: "trashing", name: "Scroll of Trashing", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "playerOther", text: "Force another player to discard a Loot card." },
  { id: "scrapping", name: "Scroll of Scrapping", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "none", text: "Force all other players to discard a Loot card." },
  { id: "over_there", name: "Scroll of What's That Over There", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "player", text: "Force any player to immediately draw and resolve one Denizen." },
  { id: "fork", name: "Scroll of Fork You Too, Buddy", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "fork", target: "none", text: "Copy a single-target spell being cast on you; the copy hits them first, then the original resolves." },
  { id: "fog", name: "Scroll of Fog", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "combat", target: "none", text: "Combat ends and Denizens are discarded, but red chits remain." },
  { id: "who_wants", name: "Scroll of Who Wants It?", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "who", text: "Ask “Who wants it?” First named player (not you) discards a random Item." },
  { id: "kitty", name: "Scroll of There, Kitty Kitty", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "cat", text: "Immediately move 1 cat of your choice up to 6 spaces." },
  { id: "in_the_cup", name: "Scroll of In the Cup", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "cup", text: "You must say “in the cup” as you play this. The last player to say it discards an item." },
  { id: "peace", name: "Scroll of Times of Peace", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "passLeft", text: "All players pass one Treasure of their choice to the player on their left." },
  { id: "war", name: "Scroll of Times of War", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "none", text: "All players pass one random Treasure to the player on their right." },
  { id: "redistribute", name: "Scroll of Wealth Redistribution", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "none", text: "All Loot into one pile. Shuffle and deal back, starting with you." },
  { id: "impede", name: "Scroll of Impede", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "playerOther", text: "Move a player back to the last room they left." },
  { id: "haste", name: "Scroll of Haste", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "preMove", target: "none", text: "Play during the move phase. Add an extra 1D6 to this turn's move roll." },
  { id: "empty", name: "Scroll of Empty Coffers", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "room", text: "Remove all Treasure chits from a Room space." },
  { id: "missed", name: "Scroll of Missed Treasure", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "room", text: "Add a Treasure chit to a Room space." },
  { id: "everyone", name: "Scroll of Everyone But You", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "turn", target: "playerOther", text: "Name a player. All other players draw one Loot card." },
  { id: "destrong", name: "Scroll of Destrongitate", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "combat", target: "combatant", text: "Target combatant's base Might is 1 until end of turn." },
  { id: "desmart", name: "Scroll of Desmartipants", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "combat", target: "combatant", text: "Target combatant's base Guile is 1 until end of turn." },
  { id: "enstrong", name: "Scroll of Enstrongitate", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "combat", target: "combatant", text: "Target combatant's Might is +3 until end of turn." },
  { id: "ensmart", name: "Scroll of Ensmartipants", copies: 1, value: 0, enc: 0, kind: "scroll", timing: "combat", target: "combatant", text: "Target combatant's Guile is +3 until end of turn." },
];

function expand(defs) {
  const out = [];
  for (const d of defs) {
    const n = d.copies || 1;
    for (let i = 0; i < n; i++) {
      const { copies: _c, ...rest } = d;
      out.push(rest);
    }
  }
  return out;
}

const ROOM_CARDS = expand(ROOM_DEFS);
const DENIZEN_CARDS = DENIZEN_DEFS.map((d) => ({ ...d, kind: "denizen" }));
const LOOT_CARDS = [...expand(TREASURE_DEFS), ...expand(SCROLL_DEFS)];

const ROOM_BY_ID = Object.fromEntries(ROOM_DEFS.map((d) => [d.id, d]));
const DENIZEN_BY_ID = Object.fromEntries(DENIZEN_DEFS.map((d) => [d.id, d]));
const LOOT_BY_ID = Object.fromEntries([...TREASURE_DEFS, ...SCROLL_DEFS].map((d) => [d.id, d]));

function lootDef(id) {
  const d = LOOT_BY_ID[id] || null;
  if (!d) return null;
  if (d.kind === "scroll") return { ...d, value: 50 };
  return d;
}

function roomDef(id) {
  return ROOM_BY_ID[id] || null;
}

function denizenDef(id) {
  return DENIZEN_BY_ID[id] || null;
}

function isTreasure(cardId) {
  const d = lootDef(cardId);
  return !!(d && (d.kind === "treasure" || d.kind === "scroll"));
}

function isScroll(cardId) {
  const d = lootDef(cardId);
  return !!(d && d.kind === "scroll");
}

module.exports = {
  ROOM_CARDS,
  DENIZEN_CARDS,
  LOOT_CARDS,
  ROOM_BY_ID,
  DENIZEN_BY_ID,
  LOOT_BY_ID,
  lootDef,
  roomDef,
  denizenDef,
  isTreasure,
  isScroll,
  SCROLL_DEFS,
};
