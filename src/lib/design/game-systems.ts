/**
 * Built-in game systems: ready-made gameplay systems (elementals, combat,
 * loot…) for game-mode designs. Adding one (edits.ts `addGameSystem`) creates a
 * system container with its mechanics, resources and content tables nested
 * inside, and the produces/consumes/triggers/modifies/uses edges between them.
 * Everything it creates is ordinary design data the user can edit afterwards;
 * the numbers are starting points, not final balance.
 *
 * Pure data, isomorphic.
 */
import type { z } from "zod";

import type {
  ContentDataSchema,
  GAME_SYSTEM_CATEGORIES,
  MechanicDataSchema,
  ResourceDataSchema,
  SystemDataSchema,
} from "@/lib/design/schema";

export type GameSystemPart = { key: string; name: string; description?: string } & (
  | { kind: "mechanic"; data: z.input<typeof MechanicDataSchema> }
  | { kind: "resource"; data: z.input<typeof ResourceDataSchema> }
  | { kind: "content"; data: z.input<typeof ContentDataSchema> }
);

export interface GameSystemLink {
  kind: "triggers" | "modifies" | "produces" | "consumes" | "uses" | "depends_on";
  /** Part keys. */
  from: string;
  to: string;
  /** Edge label, e.g. a reaction name; empty shows the edge kind. */
  label?: string;
  /** The edge's data: event (triggers), effect (modifies), rate (produces), amount (consumes), purpose (uses). */
  detail?: string;
}

export interface GameSystemTemplate {
  id: string;
  label: string;
  /** One sentence for pickers and agents. */
  summary: string;
  category: (typeof GAME_SYSTEM_CATEGORIES)[number];
  system: Omit<z.input<typeof SystemDataSchema>, "category">;
  parts: GameSystemPart[];
  links: GameSystemLink[];
  /** Part keys laid out on a circle (e.g. elements on a wheel); the rest go in a grid below. */
  ring?: string[];
}

const p = (name: string, value: string, unit = "", notes = "") => ({ name, value, unit, notes });
const f = (name: string, expression: string, notes = "") => ({ name, expression, notes });

const ELEMENTALS: GameSystemTemplate = {
  id: "elementals",
  label: "Elemental Mechanics",
  summary: "Six elements that leave auras on targets and react with each other",
  category: "combat",
  system: {
    purpose:
      "Attacks carry an element. An element applied to a target leaves an aura; applying a " +
      "different element on top of an aura triggers a reaction that consumes the aura.",
    authority: "server",
    rules: [
      "A target holds at most one aura at a time (Frozen counts as an aura)",
      "Applying the same element refreshes the aura's gauge, never stacks reactions",
      "A reaction consumes the aura gauge it reacted with",
      "Physical damage applies no element",
    ],
    parameters: [
      p("Aura duration", "8", "s", "Per 1 unit of gauge"),
      p("Application cooldown", "2.5", "s", "Per attacker, per target, per element"),
      p("Elements", "6"),
    ],
    formulas: [f("Reaction damage", "D_final = D_base × ReactionMultiplier × (1 − Res_target)")],
  },
  ring: ["fire", "water", "ice", "lightning", "earth", "wind"],
  parts: [
    {
      key: "fire",
      kind: "mechanic",
      name: "Fire",
      description: "Burns over time; strong against Ice.",
      data: {
        trigger: "Fire-element hit",
        states: ["Applied", "Burning", "Expired"],
        rules: ["Leaves a Burning aura that deals damage over time"],
        parameters: [p("Burn tick", "5", "% ATK/s"), p("Burn duration", "6", "s")],
      },
    },
    {
      key: "water",
      kind: "mechanic",
      name: "Water",
      description: "Soaks targets; extinguishes Fire, conducts Lightning.",
      data: {
        trigger: "Water-element hit",
        states: ["Applied", "Wet", "Expired"],
        rules: ["Leaves a Wet aura", "Removes Burning on contact"],
        parameters: [p("Wet duration", "8", "s")],
      },
    },
    {
      key: "ice",
      kind: "mechanic",
      name: "Ice",
      description: "Slows; freezes Wet targets.",
      data: {
        trigger: "Ice-element hit",
        states: ["Applied", "Chilled", "Expired"],
        rules: ["Leaves a Chilled aura that slows movement"],
        parameters: [p("Chill slow", "20", "%")],
      },
    },
    {
      key: "lightning",
      kind: "mechanic",
      name: "Lightning",
      description: "Bursts and chains between Wet targets.",
      data: {
        trigger: "Lightning-element hit",
        states: ["Applied", "Charged", "Expired"],
        rules: ["Leaves a Charged aura", "Chains to nearby Wet targets"],
        parameters: [p("Chain range", "4", "m"), p("Chain targets", "3")],
      },
    },
    {
      key: "earth",
      kind: "mechanic",
      name: "Earth",
      description: "Hardens: crystallizes any aura into a shield.",
      data: {
        trigger: "Earth-element hit",
        states: ["Applied", "Crystallized"],
        rules: ["Leaves no aura of its own", "Turns the target's aura into a shield shard"],
        parameters: [p("Shield", "150", "% ATK")],
      },
    },
    {
      key: "wind",
      kind: "mechanic",
      name: "Wind",
      description: "Spreads the target's aura to enemies around it.",
      data: {
        trigger: "Wind-element hit",
        states: ["Applied", "Swirl"],
        rules: ["Leaves no aura of its own", "Copies the target's aura to enemies in range"],
        parameters: [p("Swirl radius", "5", "m")],
      },
    },
    {
      key: "apply",
      kind: "mechanic",
      name: "Elemental Application",
      description: "How an elemental hit becomes an aura.",
      data: {
        trigger: "Elemental damage dealt",
        states: ["Check cooldown", "Apply / refresh aura", "Check reaction"],
        rules: ["Hits inside the application cooldown deal damage but apply no element"],
      },
    },
    {
      key: "react",
      kind: "mechanic",
      name: "Elemental Reaction",
      description: "Resolves applied element + aura into a reaction (see the Reaction Matrix).",
      data: {
        trigger: "Element applied onto a different aura",
        states: ["Look up reaction", "Apply multiplier / effect", "Consume aura"],
        formulas: [f("Gauge consumed", "G_aura −= G_applied × ReactionRatio")],
      },
    },
    {
      key: "gauge",
      kind: "resource",
      name: "Aura Gauge",
      description: "How much of an element sits on a target.",
      data: { type: "stat", initial: "0", min: "0", max: "4", regen: "−1 unit per 8 s (decay)" },
    },
    {
      key: "res",
      kind: "resource",
      name: "Elemental Resistance",
      description: "Per-element damage reduction of a target.",
      data: { type: "attribute", initial: "10%", min: "−100%", max: "90%" },
    },
    {
      key: "matrix",
      kind: "content",
      name: "Reaction Matrix",
      data: {
        type: "table",
        columns: ["Aura", "Applied", "Reaction", "Effect"],
        rows: [
          ["Fire", "Water", "Vaporize", "×2 damage, removes Burning"],
          ["Ice", "Fire", "Melt", "×2 damage, removes Chilled"],
          ["Water", "Ice", "Freeze", "Frozen for 2–4 s"],
          ["Water", "Lightning", "Electro-charged", "Chains to 3 Wet targets"],
          ["Lightning", "Fire", "Overload", "AoE explosion, knockback"],
          ["Ice", "Lightning", "Superconduct", "−40% physical resistance for 12 s"],
          ["Any", "Earth", "Crystallize", "Shield shard of the aura's element"],
          ["Any", "Wind", "Swirl", "Spreads the aura to nearby enemies"],
        ],
      },
    },
  ],
  links: [
    // Applied element → the aura it reacts with (see the Reaction Matrix).
    { kind: "modifies", from: "water", to: "fire", label: "Vaporize", detail: "×2 damage" },
    { kind: "modifies", from: "fire", to: "ice", label: "Melt", detail: "×2 damage" },
    { kind: "modifies", from: "ice", to: "water", label: "Freeze", detail: "Frozen 2–4 s" },
    {
      kind: "modifies",
      from: "lightning",
      to: "water",
      label: "Electro-charged",
      detail: "Chains",
    },
    { kind: "modifies", from: "fire", to: "lightning", label: "Overload", detail: "AoE blast" },
    { kind: "modifies", from: "lightning", to: "ice", label: "Superconduct", detail: "−40% res" },
    { kind: "modifies", from: "earth", to: "fire", label: "Crystallize", detail: "Shield shard" },
    { kind: "modifies", from: "wind", to: "fire", label: "Swirl", detail: "Spreads Burning" },
    { kind: "produces", from: "apply", to: "gauge", detail: "1–2 units per hit" },
    { kind: "triggers", from: "apply", to: "react", detail: "Applied element ≠ current aura" },
    { kind: "consumes", from: "react", to: "gauge", detail: "Gauge × reaction ratio" },
    { kind: "uses", from: "react", to: "matrix", detail: "Which reaction and its effect" },
    { kind: "modifies", from: "res", to: "react", detail: "Scales reaction damage" },
  ],
};

const COMBAT: GameSystemTemplate = {
  id: "combat",
  label: "Combat",
  summary: "Hits, damage mitigation, crits, dodge and stagger with health and stamina",
  category: "combat",
  system: {
    purpose: "Resolves attacks between characters into damage, reactions and deaths.",
    authority: "server",
    rules: [
      "Damage is computed by the server; clients only predict hit effects",
      "A character at 0 Health dies; nothing heals a dead character",
    ],
    parameters: [p("Global cooldown", "0.5", "s"), p("Crit chance base", "5", "%")],
    formulas: [f("Mitigation", "D_final = D_raw × 100 / (100 + Armor)")],
  },
  parts: [
    {
      key: "attack",
      kind: "mechanic",
      name: "Attack",
      data: {
        trigger: "Attack input",
        states: ["Startup", "Active", "Recovery"],
        rules: ["Input during Recovery is buffered and fires on its last frames"],
        parameters: [p("Input buffer", "150", "ms")],
      },
    },
    {
      key: "damage",
      kind: "mechanic",
      name: "Damage Calculation",
      data: {
        trigger: "Hit confirmed",
        formulas: [
          f("Raw damage", "D_raw = ATK × SkillMultiplier"),
          f("Mitigation", "D_final = D_raw × 100 / (100 + Armor)"),
        ],
      },
    },
    {
      key: "crit",
      kind: "mechanic",
      name: "Critical Hit",
      data: {
        trigger: "Damage roll",
        formulas: [f("Crit damage", "D = D_final × (1.5 + CritDamageBonus)")],
        parameters: [p("Base crit chance", "5", "%")],
      },
    },
    {
      key: "dodge",
      kind: "mechanic",
      name: "Dodge",
      data: {
        trigger: "Dodge input",
        states: ["Startup", "Invulnerable", "Recovery"],
        parameters: [p("I-frames", "0.3", "s"), p("Stamina cost", "25")],
      },
    },
    {
      key: "stagger",
      kind: "mechanic",
      name: "Stagger",
      data: {
        trigger: "Poise reaches 0",
        states: ["Staggered", "Recovering"],
        parameters: [p("Stagger duration", "1.2", "s")],
      },
    },
    {
      key: "hp",
      kind: "resource",
      name: "Health",
      data: { type: "stat", initial: "100", min: "0", max: "100" },
    },
    {
      key: "stamina",
      kind: "resource",
      name: "Stamina",
      data: { type: "stat", initial: "100", min: "0", max: "100", regen: "20/s after 1 s delay" },
    },
  ],
  links: [
    { kind: "triggers", from: "attack", to: "damage", detail: "Hit confirmed" },
    { kind: "modifies", from: "crit", to: "damage", detail: "×1.5 on crit" },
    { kind: "consumes", from: "damage", to: "hp", detail: "D_final" },
    { kind: "triggers", from: "damage", to: "stagger", detail: "Poise broken" },
    { kind: "consumes", from: "dodge", to: "stamina", detail: "25 per dodge" },
    { kind: "consumes", from: "attack", to: "stamina", detail: "10 per heavy attack" },
  ],
};

const STATUS_EFFECTS: GameSystemTemplate = {
  id: "status-effects",
  label: "Status Effects",
  summary: "Buffs and debuffs with duration, ticking, stacking and cleansing",
  category: "combat",
  system: {
    purpose: "Timed effects on characters: damage over time, crowd control, buffs.",
    authority: "server",
    rules: [
      "Each effect has one stacking rule: refresh, stack or ignore",
      "Crowd control grants immunity to the same effect for its duration afterwards",
    ],
    parameters: [p("Tick rate", "1", "s"), p("Max stacks", "5")],
  },
  parts: [
    {
      key: "apply",
      kind: "mechanic",
      name: "Apply Effect",
      data: { trigger: "Ability or hit with an effect", states: ["Check immunity", "Apply"] },
    },
    {
      key: "tick",
      kind: "mechanic",
      name: "Tick & Expire",
      data: { trigger: "Every tick", states: ["Tick", "Expire"] },
    },
    {
      key: "stack",
      kind: "mechanic",
      name: "Stacking",
      data: { trigger: "Same effect applied again", rules: ["Refresh, stack or ignore"] },
    },
    {
      key: "cleanse",
      kind: "mechanic",
      name: "Cleanse",
      data: { trigger: "Cleanse ability or item", rules: ["Removes debuffs, never buffs"] },
    },
    {
      key: "effects",
      kind: "content",
      name: "Effect Catalog",
      data: {
        type: "table",
        columns: ["Effect", "Type", "Duration", "Stacking", "Effect per tick"],
        rows: [
          ["Burn", "Debuff", "6 s", "Refresh", "5% ATK fire damage"],
          ["Poison", "Debuff", "10 s", "Stack ×5", "2% max HP"],
          ["Slow", "CC", "3 s", "Refresh", "−30% move speed"],
          ["Stun", "CC", "1.5 s", "Ignore", "Cannot act"],
          ["Haste", "Buff", "8 s", "Refresh", "+20% attack speed"],
        ],
      },
    },
  ],
  links: [
    { kind: "uses", from: "apply", to: "effects", detail: "Effect definitions" },
    { kind: "triggers", from: "apply", to: "stack", detail: "Effect already active" },
    { kind: "triggers", from: "apply", to: "tick", detail: "Effect applied" },
    { kind: "modifies", from: "cleanse", to: "tick", detail: "Ends debuffs early" },
  ],
};

const INVENTORY: GameSystemTemplate = {
  id: "inventory",
  label: "Inventory & Equipment",
  summary: "Slots, stacking, pickup and equipping items",
  category: "items",
  system: {
    purpose: "Holds the items a character carries and wears.",
    authority: "server",
    rules: ["An item is in exactly one place: world, bag, equipment or stash"],
    parameters: [p("Bag slots", "40"), p("Default stack size", "99")],
  },
  parts: [
    {
      key: "pickup",
      kind: "mechanic",
      name: "Pick Up",
      data: { trigger: "Interact with a dropped item", rules: ["Fails when no slot fits"] },
    },
    {
      key: "stack",
      kind: "mechanic",
      name: "Slots & Stacking",
      data: { trigger: "Item added", rules: ["Fill existing stacks first, then empty slots"] },
    },
    {
      key: "equip",
      kind: "mechanic",
      name: "Equip",
      data: {
        trigger: "Equip action",
        rules: ["One item per equipment slot", "Requirements (level, class) are checked"],
      },
    },
    {
      key: "items",
      kind: "resource",
      name: "Items",
      data: { type: "item", initial: "Starter kit", max: "40 slots" },
    },
    {
      key: "slots",
      kind: "content",
      name: "Equipment Slots",
      data: {
        type: "table",
        columns: ["Slot", "Accepts", "Count"],
        rows: [
          ["Weapon", "One-hand, two-hand", "1"],
          ["Off-hand", "Shield, focus", "1"],
          ["Armor", "Head, chest, legs, feet", "4"],
          ["Accessory", "Ring, amulet", "3"],
        ],
      },
    },
  ],
  links: [
    { kind: "produces", from: "pickup", to: "items", detail: "1 item per pickup" },
    { kind: "triggers", from: "pickup", to: "stack", detail: "Item added" },
    { kind: "uses", from: "equip", to: "slots", detail: "Which slot accepts the item" },
  ],
};

const LOOT: GameSystemTemplate = {
  id: "loot",
  label: "Loot",
  summary: "Drop tables, rarity rolls and gold drops",
  category: "items",
  system: {
    purpose: "Decides what enemies and chests drop.",
    authority: "server",
    rules: ["Loot is rolled per player (personal loot)", "Rarity is rolled before the item"],
    parameters: [p("Drops per elite", "1–3"), p("Magic find cap", "300", "%")],
  },
  parts: [
    {
      key: "drop",
      kind: "mechanic",
      name: "Drop Roll",
      data: { trigger: "Enemy killed or chest opened", states: ["Roll count", "Roll items"] },
    },
    {
      key: "rarity",
      kind: "mechanic",
      name: "Rarity Roll",
      data: {
        trigger: "Item rolled",
        formulas: [f("Weight", "W_rarity × (1 + MagicFind / 100) for Rare and above")],
      },
    },
    {
      key: "gold",
      kind: "resource",
      name: "Gold",
      data: { type: "currency", initial: "0", min: "0" },
    },
    {
      key: "tiers",
      kind: "content",
      name: "Rarity Tiers",
      data: {
        type: "table",
        columns: ["Rarity", "Weight", "Modifiers"],
        rows: [
          ["Common", "70", "0"],
          ["Magic", "22", "1–2"],
          ["Rare", "7", "3–4"],
          ["Legendary", "1", "4 + unique"],
        ],
      },
    },
    {
      key: "tables",
      kind: "content",
      name: "Drop Tables",
      data: {
        type: "table",
        columns: ["Source", "Items", "Gold"],
        rows: [
          ["Normal enemy", "0–1", "1–5"],
          ["Elite", "1–3", "10–30"],
          ["Boss", "3–5 (1 Rare+)", "100–200"],
        ],
      },
    },
  ],
  links: [
    { kind: "uses", from: "drop", to: "tables", detail: "Item count and gold range" },
    { kind: "triggers", from: "drop", to: "rarity", detail: "For each item" },
    { kind: "uses", from: "rarity", to: "tiers", detail: "Rarity weights" },
    { kind: "produces", from: "drop", to: "gold", detail: "Per drop table" },
  ],
};

const PROGRESSION: GameSystemTemplate = {
  id: "progression",
  label: "Progression",
  summary: "Experience, levels and skill points",
  category: "progression",
  system: {
    purpose: "Turns play into permanent character growth.",
    authority: "backend",
    rules: ["Levels never go down", "Each level grants skill points and base stats"],
    parameters: [p("Level cap", "50"), p("Skill points per level", "1")],
    formulas: [f("XP to next level", "XP(L) = 100 × L^1.5")],
  },
  parts: [
    {
      key: "gain",
      kind: "mechanic",
      name: "Gain Experience",
      data: { trigger: "Enemy killed, quest completed", rules: ["Party members share XP"] },
    },
    {
      key: "levelup",
      kind: "mechanic",
      name: "Level Up",
      data: { trigger: "XP ≥ XP to next level", states: ["Level +1", "Grant rewards"] },
    },
    {
      key: "spend",
      kind: "mechanic",
      name: "Spend Skill Points",
      data: { trigger: "Skill tree action", rules: ["Respec costs gold"] },
    },
    {
      key: "xp",
      kind: "resource",
      name: "Experience",
      data: { type: "experience", initial: "0", min: "0" },
    },
    {
      key: "points",
      kind: "resource",
      name: "Skill Points",
      data: { type: "currency", initial: "0", min: "0" },
    },
    {
      key: "curve",
      kind: "content",
      name: "XP Curve",
      data: {
        type: "table",
        columns: ["Level", "XP to next", "Unlocks"],
        rows: [
          ["1", "100", "—"],
          ["5", "1 118", "Second ability slot"],
          ["10", "3 162", "Specialization"],
          ["20", "8 944", "Ultimate ability"],
        ],
      },
    },
  ],
  links: [
    { kind: "produces", from: "gain", to: "xp", detail: "Per kill / quest" },
    { kind: "triggers", from: "gain", to: "levelup", detail: "Threshold reached" },
    { kind: "uses", from: "levelup", to: "curve", detail: "XP thresholds and unlocks" },
    { kind: "produces", from: "levelup", to: "points", detail: "1 per level" },
    { kind: "consumes", from: "spend", to: "points", detail: "1 per node" },
  ],
};

const CRAFTING: GameSystemTemplate = {
  id: "crafting",
  label: "Crafting",
  summary: "Gather materials, craft items from recipes and upgrade gear",
  category: "economy",
  system: {
    purpose: "Converts materials into items and upgrades.",
    authority: "server",
    rules: ["Recipes are unlocked, never random", "Crafting always succeeds; upgrades can fail"],
    parameters: [p("Upgrade levels", "+10")],
    formulas: [f("Upgrade success", "P(+n) = max(0.3, 1 − 0.07 × n)")],
  },
  parts: [
    {
      key: "gather",
      kind: "mechanic",
      name: "Gather",
      data: { trigger: "Interact with a node", parameters: [p("Respawn", "5", "min")] },
    },
    {
      key: "craft",
      kind: "mechanic",
      name: "Craft",
      data: { trigger: "Craft action at a station", states: ["Check recipe", "Consume", "Grant"] },
    },
    {
      key: "upgrade",
      kind: "mechanic",
      name: "Upgrade",
      data: { trigger: "Upgrade action", states: ["Pay", "Roll success", "Apply or keep"] },
    },
    {
      key: "materials",
      kind: "resource",
      name: "Materials",
      data: { type: "material", initial: "0", min: "0" },
    },
    {
      key: "recipes",
      kind: "content",
      name: "Recipes",
      data: {
        type: "table",
        columns: ["Recipe", "Inputs", "Output", "Station"],
        rows: [
          ["Iron Sword", "5 Iron, 2 Wood", "Iron Sword", "Forge"],
          ["Health Potion", "2 Herb, 1 Water", "Health Potion ×2", "Alchemy table"],
        ],
      },
    },
  ],
  links: [
    { kind: "produces", from: "gather", to: "materials", detail: "1–3 per node" },
    { kind: "uses", from: "craft", to: "recipes", detail: "Inputs and output" },
    { kind: "consumes", from: "craft", to: "materials", detail: "Recipe inputs" },
    { kind: "consumes", from: "upgrade", to: "materials", detail: "Scales with level" },
  ],
};

const QUESTS: GameSystemTemplate = {
  id: "quests",
  label: "Quests",
  summary: "Accept quests, track objectives and hand out rewards",
  category: "world",
  system: {
    purpose: "Gives the player goals and rewards for reaching them.",
    authority: "backend",
    rules: ["Objectives update from gameplay events, never from UI", "Rewards are granted once"],
    parameters: [p("Active quest limit", "20")],
  },
  parts: [
    {
      key: "accept",
      kind: "mechanic",
      name: "Accept Quest",
      data: { trigger: "Talk to quest giver", rules: ["Prerequisites are checked"] },
    },
    {
      key: "track",
      kind: "mechanic",
      name: "Track Objectives",
      data: { trigger: "Gameplay event (kill, collect, reach)", states: ["Progress", "Done"] },
    },
    {
      key: "complete",
      kind: "mechanic",
      name: "Complete & Reward",
      data: { trigger: "All objectives done and handed in" },
    },
    {
      key: "list",
      kind: "content",
      name: "Quest List",
      data: {
        type: "quest",
        columns: ["Quest", "Objectives", "Rewards", "Requires"],
        rows: [
          ["Rats in the Cellar", "Kill 10 rats", "50 XP, 20 gold", "—"],
          ["The Lost Blade", "Find the blade, return it", "200 XP, Rare sword", "Level 5"],
        ],
      },
    },
  ],
  links: [
    { kind: "uses", from: "accept", to: "list", detail: "Quest definitions" },
    { kind: "triggers", from: "accept", to: "track", detail: "Quest accepted" },
    { kind: "triggers", from: "track", to: "complete", detail: "All objectives done" },
  ],
};

const ENEMY_AI: GameSystemTemplate = {
  id: "enemy-ai",
  label: "Enemy AI",
  summary: "Perception, threat and a behaviour state machine for enemies",
  category: "ai",
  system: {
    purpose: "Decides what each enemy does every think tick.",
    authority: "server",
    rules: ["Enemies only react to what they perceive", "Leash back home beyond the leash range"],
    parameters: [p("Think rate", "5", "Hz"), p("Leash range", "30", "m")],
  },
  parts: [
    {
      key: "perceive",
      kind: "mechanic",
      name: "Perception",
      data: {
        trigger: "Every think tick",
        parameters: [p("Sight range", "15", "m"), p("Sight cone", "120", "°")],
      },
    },
    {
      key: "threat",
      kind: "mechanic",
      name: "Threat",
      data: {
        trigger: "Damage taken or target seen",
        formulas: [f("Threat", "T += Damage × ThreatMultiplier; target = argmax T")],
      },
    },
    {
      key: "behaviour",
      kind: "mechanic",
      name: "Behaviour States",
      data: {
        trigger: "Target changes",
        states: ["Idle", "Patrol", "Chase", "Attack", "Flee", "Return"],
      },
    },
    {
      key: "archetypes",
      kind: "content",
      name: "Enemy Archetypes",
      data: {
        type: "enemy",
        columns: ["Archetype", "Role", "Behaviour"],
        rows: [
          ["Grunt", "Melee", "Chase and attack"],
          ["Archer", "Ranged", "Keep 10 m distance"],
          ["Shaman", "Support", "Heal allies, flee when hit"],
        ],
      },
    },
  ],
  links: [
    { kind: "triggers", from: "perceive", to: "threat", detail: "Target seen" },
    { kind: "triggers", from: "threat", to: "behaviour", detail: "Top threat changed" },
    { kind: "uses", from: "behaviour", to: "archetypes", detail: "Per-archetype tuning" },
  ],
};

const SHOP: GameSystemTemplate = {
  id: "shop",
  label: "Shop & Economy",
  summary: "Buying, selling and price scaling with a gold economy",
  category: "economy",
  system: {
    purpose: "Gold sinks and sources through vendors.",
    authority: "backend",
    rules: ["Vendors buy at a fraction of the sell price", "Prices are never negotiated"],
    parameters: [p("Sell-back ratio", "25", "%")],
    formulas: [f("Price", "Price = BasePrice × RarityMultiplier × (1 + 0.05 × ItemLevel)")],
  },
  parts: [
    {
      key: "buy",
      kind: "mechanic",
      name: "Buy",
      data: { trigger: "Buy action at a vendor", rules: ["Fails when gold is short"] },
    },
    {
      key: "sell",
      kind: "mechanic",
      name: "Sell",
      data: { trigger: "Sell action at a vendor", rules: ["Sold items can be bought back once"] },
    },
    {
      key: "gold",
      kind: "resource",
      name: "Gold",
      data: { type: "currency", initial: "0", min: "0" },
    },
    {
      key: "stock",
      kind: "content",
      name: "Vendor Stock",
      data: {
        type: "item",
        columns: ["Vendor", "Item", "Price", "Restock"],
        rows: [
          ["Blacksmith", "Iron Sword", "120", "Daily"],
          ["Alchemist", "Health Potion", "25", "Unlimited"],
        ],
      },
    },
  ],
  links: [
    { kind: "consumes", from: "buy", to: "gold", detail: "Item price" },
    { kind: "produces", from: "sell", to: "gold", detail: "25% of price" },
    { kind: "uses", from: "buy", to: "stock", detail: "What each vendor sells" },
  ],
};

export const GAME_SYSTEM_TEMPLATES: readonly GameSystemTemplate[] = [
  ELEMENTALS,
  COMBAT,
  STATUS_EFFECTS,
  INVENTORY,
  LOOT,
  PROGRESSION,
  CRAFTING,
  QUESTS,
  ENEMY_AI,
  SHOP,
];

export function getGameSystemTemplate(id: string): GameSystemTemplate | undefined {
  return GAME_SYSTEM_TEMPLATES.find((t) => t.id === id);
}
