/**
 * Every card, played once, checked for a visible effect.
 *
 * The failure this guards against is not a crash — it is a card that costs its
 * cost, leaves the hand, lands in the discard pile and changes nothing else.
 * Playing all sixty-three by hand is how that goes unnoticed, so the audit is
 * mechanical: pose a board the card can actually be played on, play it, and
 * diff the result against the same state with only the *bookkeeping* applied
 * (card out of hand, cost paid, card filed). Anything left over is the effect.
 * Nothing left over is a bug.
 */
import { describe, expect, it } from "vitest";
import { algebraicToSquare, generateLegalMoves, parseFen, type Color, type Square } from "@skill/chess-core";
import { createMatch, deriveRules } from "./match.js";
import { cardCost, reduce } from "./reduce.js";
import { SKILLS, skillMeta, type TargetSpec } from "./skills.js";
import type { Action, Enchant, LastingCard, MatchState, Pick } from "./types.js";

const sq = (alg: string) => algebraicToSquare(alg);

/** Contact position with room to castle, pawns in range, and a queen each. */
const RICH = "r2qk2r/pppbbppp/2n2n2/3pp3/3PP3/2N2N2/PPPBBPPP/R2QK2R w - - 0 1";

interface Pose {
  fen?: string;
  /** Extra cards in white's hand, for the cards that ask about their own hand. */
  hand?: string[];
  /** Enchants already in play, so a dispel has something to lift. */
  enchants?: Array<Omit<Enchant, "id">>;
  /** Cards already in the discard pile, for the cards that fish there. */
  discard?: string[];
  /** Cards in the opponent's hand. */
  oppHand?: string[];
  /** 지속 cards already in play for the opponent. */
  oppLasting?: string[];
  /** Cards left in white's library. */
  library?: string[];
  /** Set up the last move, so 무르기 has something to take back. */
  withUndo?: boolean;
}

/** Cards the generic position cannot host, and the position that can. */
const POSES: Record<string, Pose> = {
  // These three point at a card in a hand, so they need a hand to point at
  // once the card itself has left it.
  offering: { hand: ["dash", "spy"] },
  disguise: { hand: ["dash", "spy"] },
  exchange: { hand: ["dash", "spy"] },
  // 투창 throws along a clear line from a pawn beside the king; on the contact
  // board every ray off that pawn is blocked by white's own pieces.
  javelin: { fen: "r2qk2r/pppbbppp/2n2n2/3pp3/3PP3/2N5/PPPBBPPP/R2QK2R w - - 0 1" },
  // An enemy piece has to be standing next to the king for these to have a target.
  "kings-strike": { fen: "4k3/8/8/8/8/8/3Pn3/R3K2R w - - 0 1" },
  bodyguard: { fen: "4k3/8/8/8/8/8/3PP3/R3K2R w - - 0 1" },
  // A dispel needs something to dispel.
  cleanse: { enchants: [{ card: "small-sandbag", owner: "b", on: { kind: "piece", sq: sq("d4") }, turnsLeft: 2, ticksOn: "b" }] },
  unbind: { enchants: [{ card: "small-sandbag", owner: "w", on: { kind: "piece", sq: sq("d5") }, turnsLeft: 2, ticksOn: "w" }] },
  "purifying-light": { enchants: [{ card: "small-sandbag", owner: "b", on: { kind: "piece", sq: sq("d4") }, turnsLeft: 2, ticksOn: "b" }] },
  sever: { enchants: [] },
  // These pull a card out of the discard pile.
  herald: { discard: ["meditate", "dash"] },
  recall: { discard: ["meditate", "dash"] },
  // 무르기 reverts the opponent's last move.
  rewind: { withUndo: true },
  // 파괴 takes either a lasting card in play or a card from the enemy hand.
  shatter: { oppLasting: ["beacon"] },
  typhoon: { oppLasting: ["beacon"] },
};

const DEFAULT_OPP_HAND = ["meditate", "dash", "spy"];
const DEFAULT_LIBRARY = ["meditate", "dash", "spy", "scout", "readiness"];

function posed(card: string, pose: Pose = {}): MatchState {
  const m = createMatch("skill", [], []);
  m.chess = parseFen(pose.fen ?? RICH);
  m.players.w.hand = [card, ...(pose.hand ?? [])];
  m.players.b.hand = [...(pose.oppHand ?? DEFAULT_OPP_HAND)];
  m.players.w.discard = [...(pose.discard ?? [])];
  m.players.w.library = [...(pose.library ?? DEFAULT_LIBRARY)];
  m.players.b.library = [...DEFAULT_LIBRARY];
  m.players.b.lasting = (pose.oppLasting ?? []).map((c, i) => ({ id: 900 + i, card: c, owner: "b" as Color }));
  m.players.w.cost = 10;
  m.players.b.cost = 10;
  m.players.w.bonusCost = 0;
  m.players.b.bonusCost = 0;
  m.enchants = (pose.enchants ?? []).map((e, i) => ({ ...e, id: 800 + i }));
  m.nextEffectId = 1000;
  m.pending = null;
  m.phase = "skill";
  if (pose.withUndo) {
    m.undo = {
      mover: "b",
      chess: { ...m.chess, board: m.chess.board.slice() },
      captured: null,
      from: sq("e5"),
      to: sq("e5"),
    };
  }
  m.rules = deriveRules(m);
  return m;
}

/**
 * The state as it would be if the card had cost its cost and gone to the pile
 * without doing anything at all. Everything the real play differs from this by
 * is the card's actual effect.
 */
function bookkeepingOnly(m: MatchState, card: string): MatchState {
  const b = structuredClone(m);
  const meta = skillMeta(card)!;
  b.players.w.hand = b.players.w.hand.filter((c) => c !== card);
  b.players.w.cost -= cardCost(card, m, "w");
  b.skillsPlayed += 1;
  if (meta.speed === "normal") b.moveSpent = true;
  if (meta.type === "lasting") {
    b.players.w.lasting.push({ id: b.nextEffectId++, card, owner: "w" });
  } else {
    b.players.w.discard.push(card);
  }
  b.rules = deriveRules(b);
  return b;
}

/** Everything the card could have touched, as a comparable string. */
function fingerprint(s: MatchState): string {
  return JSON.stringify({
    board: s.chess.board,
    turn: s.chess.turn,
    phase: s.phase,
    moveSpent: s.moveSpent,
    enchants: s.enchants.map((e) => ({ ...e, id: 0 })),
    pending: s.pending?.kind ?? null,
    status: s.status,
    rules: s.rules,
    w: player(s, "w"),
    b: player(s, "b"),
  });
}

function player(s: MatchState, c: Color) {
  const p = s.players[c];
  return {
    hand: [...p.hand].sort(),
    library: [...p.library].sort(),
    libraryCount: p.library.length,
    discard: [...p.discard].sort(),
    cost: p.cost,
    bonusCost: p.bonusCost,
    lasting: p.lasting.map((l) => ({ ...l, id: 0 })),
    locked: [...p.locked].sort(),
    revealed: [...p.revealed].sort(),
    seesHand: p.seesHand,
    seenTop: p.seenTop,
    doubleMove: p.doubleMove,
    freeMoves: p.freeMoves,
  };
}

// ── target search ───────────────────────────────────────────
function candidates(s: MatchState, color: Color, spec: TargetSpec): Pick[] {
  const out: Pick[] = [];
  const board = s.chess.board;
  const other: Color = color === "w" ? "b" : "w";
  for (const kind of spec.kinds) {
    if (kind === "own-piece" || kind === "enemy-piece" || kind === "empty") {
      for (let i = 0; i < board.length; i++) {
        const piece = board[i];
        if (kind === "empty") {
          if (!piece) out.push({ kind: "square", sq: i as Square });
          continue;
        }
        if (!piece) continue;
        if (piece.color !== (kind === "own-piece" ? color : other)) continue;
        if (piece.type === "k" && !spec.king) continue;
        if (spec.pieces && !spec.pieces.includes(piece.type)) continue;
        out.push({ kind: "square", sq: i as Square });
      }
    } else if (kind === "own-hand") {
      s.players[color].hand.forEach((_, i) => out.push({ kind: "index", index: i }));
    } else if (kind === "opp-hand") {
      s.players[other].hand.forEach((_, i) => out.push({ kind: "index", index: i }));
    } else if (kind === "discard") {
      s.players[color].discard.forEach((_, i) => out.push({ kind: "index", index: i }));
    } else if (kind === "lasting") {
      for (const c of ["w", "b"] as Color[]) {
        for (const l of s.players[c].lasting) out.push({ kind: "index", index: l.id });
      }
    } else if (kind === "choice") {
      for (const o of spec.options ?? []) out.push({ kind: "option", option: o });
    }
  }
  return out;
}

const asAction = (p: Pick): Action =>
  p.kind === "square" ? { type: "target", sq: p.sq }
  : p.kind === "index" ? { type: "target", index: p.index }
  : { type: "target", option: p.option };

/**
 * Play the card and answer its targets, searching for a combination it accepts.
 * Returns the resolved state, or null if no combination of legal picks resolved
 * — which is itself worth reporting: a card no set of targets can satisfy is a
 * card that can never be played.
 */
function playAndTarget(m: MatchState, card: string): MatchState | null {
  const first = reduce(m, { type: "play-skill", index: 0 });
  if (!first.ok) return null;
  return walk(first.state, card);
}

function walk(s: MatchState, card: string, depth = 0): MatchState | null {
  if (depth > 8) return null;
  const pending = s.pending;
  if (!pending || pending.kind !== "targeting") return s;

  const specs = skillMeta(card)!.targets ?? [];
  const spec = specs[pending.step]!;
  const already = pending.picks[pending.step]?.length ?? 0;
  const options = candidates(s, pending.color, spec);

  for (const pick of options) {
    const r = reduce(s, asAction(pick));
    if (!r.ok) continue;
    // A step that wants more than one pick is fed greedily; a step that is now
    // full has already resolved inside the reducer.
    let next = r.state;
    if (next.pending?.kind === "targeting" && next.pending.step === pending.step) {
      const filled = next.pending.picks[pending.step]?.length ?? 0;
      if (filled > already && filled < spec.max) {
        for (const extra of options) {
          const more = reduce(next, asAction(extra));
          if (more.ok) next = more.state;
          if (next.pending?.kind !== "targeting" || next.pending.step !== pending.step) break;
        }
        if (next.pending?.kind === "targeting" && next.pending.step === pending.step) {
          const done = reduce(next, { type: "target-done" });
          if (done.ok) next = done.state;
        }
      }
    }
    const out = walk(next, card, depth + 1);
    if (out) return out;
  }
  return null;
}

// ── the audit ───────────────────────────────────────────────
/**
 * 지속 cards install a standing rule and change nothing the instant they land,
 * so the diff below would call every one of them dead. They get their own
 * behavioural tests further down instead — the ones that actually prove the rule
 * fires, which is the part a diff at play time could never see.
 */
const DEFERRED = new Set(SKILLS.filter((s) => s.type === "lasting").map((s) => s.id));
const IMMEDIATE = SKILLS.filter((s) => s.speed !== "counter" && !DEFERRED.has(s.id));

describe("skill coverage: every card that resolves at once does something", () => {
  for (const meta of IMMEDIATE) {
    it(`${meta.id} has an observable effect`, () => {
      const m = posed(meta.id, POSES[meta.id]);
      const after = playAndTarget(m, meta.id);
      expect(after, `${meta.id}: no combination of legal targets resolved`).not.toBeNull();
      const expected = bookkeepingOnly(m, meta.id);
      expect(
        fingerprint(after!),
        `${meta.id} changed nothing beyond leaving the hand and paying its cost`,
      ).not.toEqual(fingerprint(expected));
    });
  }
});

describe("skill coverage: every card is playable at all", () => {
  for (const meta of SKILLS.filter((s) => s.speed !== "counter")) {
    it(`${meta.id} can be played and resolved`, () => {
      const m = posed(meta.id, POSES[meta.id]);
      expect(playAndTarget(m, meta.id), `${meta.id} could not be resolved`).not.toBeNull();
    });
  }
});

// ── the deferred eight ──────────────────────────────────────
/** A state with `cards` already in play as white's 지속 cards. */
function withLasting(cards: string[], fen = RICH): MatchState {
  const m = createMatch("skill", [], []);
  m.chess = parseFen(fen);
  m.players.w.lasting = cards.map((c, i) => ({ id: 700 + i, card: c, owner: "w" as Color }));
  m.players.w.library = ["dash", "spy", "meditate", "scout", "readiness", "dash"];
  m.players.b.library = ["dash", "spy", "meditate", "scout", "readiness", "dash"];
  m.players.w.cost = 10;
  m.players.b.cost = 10;
  m.pending = null;
  m.rules = deriveRules(m);
  return m;
}

const ok = (r: ReturnType<typeof reduce>): MatchState => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.state;
};
/** A deterministic die: 0.9 rolls a 6, 0.0 rolls a 1. */
const rolls = (v: number) => () => v;

describe("lasting cards actually fire", () => {
  it("beacon draws a card when a piece of yours dies", () => {
    // 투창 kills the thrown pawn as well as its target, so white loses a piece
    // on its own turn without needing the opponent to take one.
    const fen = "r2qk2r/pppbbppp/2n2n2/3pp3/3PP3/2N5/PPPBBPPP/R2QK2R w - - 0 1";
    const base = withLasting([], fen);
    const lit = withLasting(["beacon"], fen);
    for (const s of [base, lit]) { s.players.w.hand = ["javelin"]; s.phase = "skill"; }

    const before = base.players.w.hand.length;
    const without = playAndTarget(base, "javelin")!;
    const with_ = playAndTarget(lit, "javelin")!;
    // Two pieces died (the pawn and its target), but only white's pawn is white's.
    expect(without.players.w.hand.length).toBe(before - 1);
    expect(with_.players.w.hand.length).toBe(before - 1 + 1);
  });

  it("espionage reveals what the opponent drew on a 4 or better", () => {
    const s = withLasting(["espionage"]);
    s.chess = { ...s.chess, turn: "b" };
    s.phase = "draw";
    const seen = ok(reduce(s, { type: "draw" }, rolls(0.9))); // rolls a 6
    expect(seen.players.w.revealed.length).toBe(1);
    const missed = ok(reduce(s, { type: "draw" }, rolls(0.0))); // rolls a 1
    expect(missed.players.w.revealed.length).toBe(0);
  });

  it("thrift takes a cost off your cards and muddy-water adds one to theirs", () => {
    const plain = withLasting([]);
    expect(cardCost("assassinate", plain, "w")).toBe(7);
    expect(cardCost("assassinate", withLasting(["thrift"]), "w")).toBe(6);
    expect(cardCost("assassinate", withLasting(["muddy-water"]), "b")).toBe(8);
    // Never below 1, however much you stack.
    expect(cardCost("scout", withLasting(["thrift"]), "w")).toBe(1);
  });

  it("agile-knight gives your knights the extra jump", () => {
    const fen = "4k3/8/8/8/8/8/8/4K1N1 w - - 0 1";
    const knight = algebraicToSquare("g1");
    const plain = withLasting([], fen);
    const agile = withLasting(["agile-knight"], fen);
    expect(agile.rules.agileKnight?.w).toBe(true);
    const before = generateLegalMoves(plain.chess, knight, plain.rules).length;
    const after = generateLegalMoves(agile.chess, knight, agile.rules).length;
    expect(after).toBeGreaterThan(before);
  });

  it("sanctuary stops both captures and cards aimed at the king's ring", () => {
    // A pawn beside the white king, and a knight on the far side of the board
    // that the sanctuary does not reach — so the card has a legal target and the
    // refusal below is about the shield rather than about having nothing to hit.
    const fen = "3rk3/8/8/8/N7/8/3P4/3QK3 w - - 0 1";
    const guarded = withLasting(["sanctuary"], fen);
    const pawn = algebraicToSquare("d2");
    const outside = algebraicToSquare("a4");
    expect(guarded.rules.protected).toContain(pawn);
    expect(guarded.rules.protected).not.toContain(outside);

    // A card aimed at it is refused — this is the half the card text promised
    // and `rules.protected` alone never delivered.
    const s = { ...guarded, chess: { ...guarded.chess, turn: "b" as Color } };
    s.players.b.hand = ["assassinate"];
    s.players.b.cost = 10;
    s.phase = "skill";
    const played = reduce(s, { type: "play-skill", index: 0 });
    expect(played.ok).toBe(true);
    const casting = (played as { ok: true; state: MatchState }).state;
    expect(reduce(casting, { type: "target", sq: pawn }).ok).toBe(false);
    // The knight outside the ring is still fair game.
    expect(reduce(casting, { type: "target", sq: outside }).ok).toBe(true);
  });

  it("plague takes a pawn on a side's third turn, and survives doing it", () => {
    let s = withLasting(["plague"]);
    const pawns = (m: MatchState) => m.chess.board.filter((p) => p?.type === "p").length;
    const start = pawns(s);
    // Black's turn opens on every odd end-turn from here, so black's third one
    // is the fifth. Nothing may happen before it, and the card has to still be
    // on the field afterwards — it used to eat itself on turn two instead.
    for (let i = 1; i <= 4; i++) {
      s = ok(reduce(s, { type: "end-turn" }, rolls(0.5)));
      expect(pawns(s), `pawn lost early, on end-turn ${i}`).toBe(start);
      expect(s.players.w.lasting.map((l) => l.card)).toContain("plague");
    }
    s = ok(reduce(s, { type: "end-turn" }, rolls(0.5)));
    expect(pawns(s)).toBe(start - 1);
    expect(s.players.w.lasting.map((l) => l.card)).toContain("plague");
  });

  it("gambling-den rolls at every turn start, for good or ill", () => {
    const pieces = (m: MatchState) => m.chess.board.filter((p) => !!p).length;
    const bad = withLasting(["gambling-den"]);
    bad.phase = "move";
    const lost = ok(reduce(bad, { type: "end-turn" }, rolls(0.0))); // rolls a 1
    expect(pieces(lost)).toBe(pieces(bad) - 1);

    const good = withLasting(["gambling-den"]);
    good.phase = "move";
    const won = ok(reduce(good, { type: "end-turn" }, rolls(0.9))); // rolls a 6
    expect(won.players.b.hand.length).toBeGreaterThan(good.players.b.hand.length);
  });
});
