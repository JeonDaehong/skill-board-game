/**
 * Every card, actually played.
 *
 * The client plays a card the same way for all sixty-three: `play-skill`, then
 * one `target` action per pick the card asks for. This suite does exactly that,
 * choosing targets the way a player would — by trying what the board offers and
 * keeping the first pick the engine accepts. A card that cannot be played to
 * completion from a position built for it fails here, which is the check that
 * matters: the table in skills.ts promises a card exists, and this proves the
 * promise is kept.
 */
import { describe, expect, it } from "vitest";
import { algebraicToSquare, parseFen } from "@skill/chess-core";
import { SKILLS } from "./skills.js";
import { createMatch, deriveRules } from "./match.js";
import { reduce } from "./reduce.js";
import type { Action, MatchState } from "./types.js";

const sq = algebraicToSquare;

/**
 * A roomy sandbox: both kings have their own pawns beside them (투창, 비장의
 * 한방), the sides touch in the middle (밀쳐내기, 끌어당기기, 동맹사슬), and
 * there is empty space to drop things into.
 */
const SANDBOX = "r2qk2r/ppp1nppp/8/3pP3/3Pp3/8/PPP1NPPP/R2QK2R w KQkq - 0 1";

/** Positions for cards the sandbox cannot satisfy on its own. */
const SETUP: Record<string, string> = {
  // A black piece inside the white king's ring, for the assassination.
  "kings-strike": "r3k2r/ppp2ppp/8/8/8/8/PPPn1PPP/R2QK2R w KQkq - 0 1",
  // A lone enemy queen to name.
  regicide: "r2qk2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
  // A rook home and a clear path, so castling has somewhere to go.
  citadel: "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
};

/** Cards that need something already in play before they mean anything. */
function prepare(m: MatchState, id: string): void {
  if (id === "herald" || id === "recall") m.players.w.discard = ["meditate", "spy"];
  if (id === "scout" || id === "coerce" || id === "exchange" || id === "shatter") {
    m.players.b.hand = ["meditate", "spy", "scout"];
  }
  if (id === "shatter") {
    m.players.b.lasting = [{ id: 777, card: "beacon", owner: "b" }];
  }
  if (id === "cleanse" || id === "purifying-light") {
    m.enchants = [{
      id: 1, card: "large-sandbag", owner: "b", on: { kind: "piece", sq: sq("e2") },
      turnsLeft: 5, ticksOn: "b",
    }];
  }
  if (id === "unbind") {
    m.enchants = [{
      id: 1, card: "large-sandbag", owner: "w", on: { kind: "piece", sq: sq("e7") },
      turnsLeft: 5, ticksOn: "w",
    }];
  }
  if (id === "typhoon") {
    m.players.b.lasting = [{ id: 778, card: "thrift", owner: "b" }];
    m.players.w.lasting = [{ id: 779, card: "beacon", owner: "w" }];
  }
  if (id === "rewind") {
    // 무르기 answers a move that actually happened, so the snapshot it restores
    // has to be a genuinely earlier position.
    m.undo = {
      mover: "b",
      chess: parseFen("r2qk2r/ppp1nppp/8/3p4/3Pp3/8/PPP1NPPP/R2QK2R b KQkq - 0 1"),
      captured: null,
      from: sq("e7"),
      to: sq("e5"),
    };
  }
  if (id === "divination") m.players.w.library = ["meditate", "spy", "scout", "readiness"];
  if (id === "disguise" || id === "offering" || id === "exchange") {
    m.players.w.hand.push("thrift", "beacon");
  }
}

function posed(id: string): MatchState {
  const m = createMatch("skill", [], []);
  m.chess = parseFen(SETUP[id] ?? SANDBOX);
  m.players.w.hand = [id];
  // Not quite the cap: 준비 태세 grants cost for the turn, and the pool cannot
  // exceed 10 — on a full bank the grant is correctly worth nothing, which
  // would read here as a card that did nothing.
  m.players.w.cost = 9;
  m.players.b.cost = 9;
  // Distinct filler ids, so "the card left my hand" cannot be confused with
  // having drawn another copy of it.
  m.players.w.library = ["thrift", "beacon", "sanctuary", "plague", "espionage"];
  m.players.b.library = ["thrift", "beacon"];
  m.pending = null;
  m.phase = "skill";
  prepare(m, id);
  m.rules = deriveRules(m);
  return m;
}

/** Everything the current target step could plausibly be answered with. */
function candidates(s: MatchState): Action[] {
  const p = s.pending;
  if (p?.kind !== "targeting") return [];
  const spec = SKILLS.find((x) => x.id === p.card)?.targets?.[p.step];
  if (!spec) return [];
  const out: Action[] = [];
  for (const kind of spec.kinds) {
    if (kind === "own-piece" || kind === "enemy-piece" || kind === "empty") {
      for (let i = 0; i < s.chess.board.length; i++) out.push({ type: "target", sq: i });
    } else if (kind === "own-hand") {
      s.players[p.color].hand.forEach((_, i) => out.push({ type: "target", index: i }));
    } else if (kind === "opp-hand") {
      s.players[p.color === "w" ? "b" : "w"].hand.forEach((_, i) => out.push({ type: "target", index: i }));
    } else if (kind === "discard") {
      s.players[p.color].discard.forEach((_, i) => out.push({ type: "target", index: i }));
    } else if (kind === "lasting") {
      for (const c of ["w", "b"] as const) {
        for (const l of s.players[c].lasting) out.push({ type: "target", lasting: l.id });
      }
    } else if (kind === "choice") {
      for (const option of spec.options ?? []) out.push({ type: "target", option });
    }
  }
  return out;
}

/**
 * Answer the outstanding target steps, backtracking when a pick paints the card
 * into a corner — a player who grabs a rook with nothing behind it to shove
 * simply picks a different piece, and so does this.
 */
function resolveTargets(s: MatchState, depth = 0): MatchState | null {
  if (s.pending?.kind !== "targeting") return s;
  if (depth > 6) return null;

  for (const action of candidates(s)) {
    const r = reduce(s, action);
    if (!r.ok) continue;
    const done = resolveTargets(r.state, depth + 1);
    if (done) return done;
  }
  // A step that accepts zero picks may be closed empty instead.
  const closed = reduce(s, { type: "target-done" });
  return closed.ok ? resolveTargets(closed.state, depth + 1) : null;
}

/** Play `id` and answer every step it asks about. Returns the resting state. */
function playThrough(id: string): { state: MatchState } {
  const first = reduce(posed(id), { type: "play-skill", index: 0 });
  if (!first.ok) throw new Error(`play-skill refused: ${first.error}`);
  const done = resolveTargets(first.state);
  if (!done) throw new Error(`${id}: no combination of targets could be completed`);
  return { state: done };
}

describe("every card can actually be played", () => {
  for (const card of SKILLS.filter((c) => c.speed !== "counter")) {
    it(`${card.id} (${card.cost}c ${card.type}/${card.speed})`, () => {
      const { state } = playThrough(card.id);
      // It left the hand, and nothing is still waiting on a target.
      expect(state.players.w.hand).not.toContain(card.id);
      expect(state.pending?.kind).not.toBe("targeting");
      // It went somewhere it can be found again: the discard pile for an
      // active or enchant, the lasting row for a 지속 card.
      const filed =
        state.players.w.discard.includes(card.id) ||
        state.players.w.lasting.some((l) => l.card === card.id);
      expect(filed, `${card.id} vanished instead of being filed`).toBe(true);
    });
  }
});

describe("every card does something", () => {
  /**
   * A card that resolves cleanly but changes nothing is a bug the suite above
   * cannot see, so each one is checked against what it claims to do.
   */
  const CHANGED: Record<string, (before: MatchState, after: MatchState) => boolean> = {
    scout: (b, a) => a.players.w.revealed.length > b.players.w.revealed.length,
    spy: (_b, a) => a.players.w.seenTop !== null,
    divination: (_b, a) => a.pending?.kind === "arrange",
    meditate: (b, a) => a.players.w.hand.length > b.players.w.hand.length,
    offering: (b, a) => a.players.w.discard.length > b.players.w.discard.length,
    disguise: (b, a) => a.players.w.hand.join() !== b.players.w.hand.join(),
    readiness: (_b, a) => a.players.w.bonusCost === 2,
    bait: (_b, a) => a.enchants.some((e) => e.card === "bait"),
    "small-sandbag": (_b, a) => a.enchants.some((e) => e.card === "small-sandbag"),
    dash: (b, a) => boardDiffers(b, a),
    shove: (b, a) => boardDiffers(b, a),
    pull: (b, a) => boardDiffers(b, a),
    leap: (_b, a) => a.enchants.some((e) => e.card === "leap"),
    swamp: (_b, a) => a.players.w.lasting.some((l) => l.card === "swamp" && l.sq !== undefined),
    clairvoyance: (_b, a) => a.players.w.revealed.length === a.players.b.hand.length,
    herald: (b, a) => a.players.w.discard.length < b.players.w.discard.length + 1,
    javelin: (b, a) => boardDiffers(b, a),
    citadel: (b, a) => boardDiffers(b, a),
    "large-sandbag": (_b, a) => a.enchants.some((e) => e.card === "large-sandbag"),
    beacon: (_b, a) => a.players.w.lasting.some((l) => l.card === "beacon"),
    cleanse: (b, a) => a.enchants.length < b.enchants.length,
    unbind: (b, a) => a.enchants.length < b.enchants.length,
    recall: (b, a) => a.players.w.hand.length > b.players.w.hand.length - 1,
    coerce: (b, a) => a.players.b.hand.length === b.players.b.hand.length - 2,
    transpose: (b, a) => boardDiffers(b, a),
    "guard-drill": (_b, a) => a.enchants.some((e) => e.card === "guard-drill"),
    disarm: (_b, a) => a.enchants.some((e) => e.card === "disarm" && e.ticksOn === "b"),
    mine: (_b, a) => a.enchants.some((e) => e.card === "mine"),
    hallucination: (_b, a) => a.players.w.lasting.some((l) => l.card === "hallucination"),
    espionage: (_b, a) => a.players.w.lasting.some((l) => l.card === "espionage"),
    double: (_b, a) => a.players.w.doubleMove !== null,
    "blood-price": (_b, a) => a.pending?.kind === "free-moves",
    promotion: (b, a) => boardDiffers(b, a),
    "double-image": (b, a) => countPieces(a) > countPieces(b),
    "kings-strike": (b, a) => countPieces(a) < countPieces(b),
    rewind: (b, a) => boardDiffers(b, a),
    thrift: (_b, a) => a.players.w.lasting.some((l) => l.card === "thrift"),
    shatter: (b, a) => a.players.b.lasting.length < b.players.b.lasting.length,
    exchange: (b, a) => a.players.b.hand.join() !== b.players.b.hand.join(),
    awaken: (b, a) => boardDiffers(b, a),
    brainwash: (b, a) => boardDiffers(b, a),
    "bond-chain": (_b, a) => a.enchants.filter((e) => e.card === "bond-chain").length === 2,
    "fate-chain": (_b, a) => a.enchants.filter((e) => e.card === "fate-chain").length === 2,
    "agile-knight": (_b, a) => a.rules.agileKnight?.w === true,
    "muddy-water": (_b, a) => a.players.w.lasting.some((l) => l.card === "muddy-water"),
    pandemonium: (b, a) => boardDiffers(b, a),
    assassinate: (b, a) => countPieces(a) < countPieces(b),
    regicide: (b, a) => countPieces(a) < countPieces(b),
    sanctuary: (_b, a) => (a.rules.protected?.length ?? 0) > 0,
    plague: (_b, a) => a.players.w.lasting.some((l) => l.card === "plague"),
    "purifying-light": (b, a) => a.enchants.length < b.enchants.length,
    typhoon: (b, a) => a.players.b.lasting.length < b.players.b.lasting.length,
    earthquake: (b, a) => countPieces(a) < countPieces(b),
    "gambling-den": (_b, a) => a.players.w.lasting.some((l) => l.card === "gambling-den"),
  };

  for (const [id, check] of Object.entries(CHANGED)) {
    it(`${id} leaves a mark`, () => {
      const before = posed(id);
      const { state } = playThrough(id);
      expect(check(before, state), `${id} resolved without changing anything`).toBe(true);
    });
  }
});

function boardDiffers(a: MatchState, b: MatchState): boolean {
  return a.chess.board.some((p, i) => {
    const q = b.chess.board[i];
    return (p?.type ?? null) !== (q?.type ?? null) || (p?.color ?? null) !== (q?.color ?? null);
  });
}

function countPieces(s: MatchState): number {
  return s.chess.board.filter(Boolean).length;
}
