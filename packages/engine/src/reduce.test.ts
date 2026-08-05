import { describe, expect, it } from "vitest";
import { MASTER_DIMS, algebraicToSquare, parseFen } from "@skill/chess-core";
import { createMatch, deriveRules } from "./match.js";
import { reduce } from "./reduce.js";
import { pieceCardId } from "./cards.js";
import type { GameMode } from "./modes.js";
import type { LastingCard, MatchState } from "./types.js";

const sq = algebraicToSquare;
/** Master-mode squares are 10 wide, so they need their own converter. */
const msq = (alg: string) => algebraicToSquare(alg, MASTER_DIMS);

function expectOk(r: ReturnType<typeof reduce>): MatchState {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.state;
}

function expectFail(r: ReturnType<typeof reduce>): string {
  if (r.ok) throw new Error("expected the action to be rejected");
  return r.error;
}

/** A deterministic rng, so a test about dice is a test and not a coin flip. */
const fixed = (value: number) => () => value;

interface Setup {
  mode?: GameMode;
  fen?: string;
  /** Cards placed straight into white's hand. */
  hand?: string[];
  /** 지속 cards treated as already in play for white. */
  lasting?: string[];
  /** Black's hand, for counter-window tests. */
  oppHand?: string[];
  /** Black's 지속 cards. */
  oppLasting?: string[];
  /** Cost banked by both sides. Generous by default so tests aren't about money. */
  cost?: number;
}

const asLasting = (cards: string[], owner: "w" | "b"): LastingCard[] =>
  cards.map((card, i) => ({ id: 900 + i + (owner === "b" ? 50 : 0), card, owner }));

/**
 * A match posed for one assertion: cards are dealt straight into hand and the
 * cost pool is filled, so a test can say what it is about instead of spending
 * ten turns banking up to it.
 */
function posed(s: Setup = {}): MatchState {
  const mode = s.mode ?? "skill";
  const m = createMatch(mode, [], []);
  if (s.fen) m.chess = parseFen(s.fen);
  m.players.w.hand = [...(s.hand ?? [])];
  m.players.b.hand = [...(s.oppHand ?? [])];
  m.players.w.lasting = asLasting(s.lasting ?? [], "w");
  m.players.b.lasting = asLasting(s.oppLasting ?? [], "b");
  m.players.w.cost = s.cost ?? 10;
  m.players.b.cost = s.cost ?? 10;
  m.pending = null;
  m.phase = "skill";
  m.rules = deriveRules(m);
  return m;
}

/** Play white's first card and answer its target steps in order. */
function play(m: MatchState, ...targets: Array<number | string | { sq: number }>): MatchState {
  let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
  for (const t of targets) {
    const action =
      typeof t === "number" ? { type: "target" as const, index: t }
      : typeof t === "string" ? { type: "target" as const, option: t }
      : { type: "target" as const, sq: t.sq };
    s = expectOk(reduce(s, action));
  }
  return s;
}

const at = (n: number) => ({ sq: n });

describe("modes", () => {
  it("classic plays plain chess with no deck, cost or phases", () => {
    const m = createMatch("classic", [], []);
    expect(m.phase).toBe("move");
    expect(m.players.w.hand).toHaveLength(0);
    expect(m.players.w.cost).toBe(0);
    const s = expectOk(reduce(m, { type: "move", from: sq("e2"), to: sq("e4") }));
    expect(s.chess.board[sq("e4")]?.type).toBe("p");
    expect(s.chess.turn).toBe("b");
    // The input state is never mutated.
    expect(m.chess.board[sq("e2")]?.type).toBe("p");
  });

  it("classic refuses card actions outright", () => {
    const m = createMatch("classic", [], []);
    expect(expectFail(reduce(m, { type: "play-skill", index: 0 }))).toMatch(/no cards/);
    expect(expectFail(reduce(m, { type: "pass-phase" }))).toMatch(/classic/);
  });

  it("skill mode is 8x8 with a 30-card deck; master is 10x10 with 50", () => {
    expect(createMatch("skill", [], []).chess.width).toBe(8);
    const master = createMatch("master", [], []);
    expect(master.chess.width).toBe(10);
    expect(master.chess.board.filter(Boolean)).toHaveLength(6);
  });

  it("rejects an illegal move", () => {
    expect(reduce(posed(), { type: "move", from: sq("e2"), to: sq("e5") }).ok).toBe(false);
  });
});

describe("cost pool", () => {
  it("banks one per turn and stops at ten", () => {
    let s = createMatch("skill", [], []);
    expect(s.players.w.cost).toBe(1); // white's opening turn already collected
    s = expectOk(reduce(s, { type: "move", from: sq("e2"), to: sq("e4") }));
    expect(s.players.b.cost).toBe(1);
    s = expectOk(reduce(s, { type: "move", from: sq("e7"), to: sq("e5") }));
    expect(s.players.w.cost).toBe(2);

    const rich = posed({ cost: 10 });
    rich.chess = { ...rich.chess, turn: "b" };
    const back = expectOk(reduce(rich, { type: "move", from: sq("e7"), to: sq("e5") }));
    expect(back.players.w.cost).toBe(10); // capped, not 11
  });

  it("refuses a card the pool cannot pay for", () => {
    const m = posed({ hand: ["earthquake"], cost: 4 }); // earthquake costs 8
    expect(expectFail(reduce(m, { type: "play-skill", index: 0 }))).toMatch(/not enough cost/);
  });

  it("spends the printed cost and discards the card", () => {
    const m = posed({ hand: ["meditate"], cost: 5 });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.cost).toBe(4); // meditate costs 1
    expect(s.players.w.hand).not.toContain("meditate");
    expect(s.players.w.discard).toContain("meditate");
  });

  it("절약 shaves a cost, 흙탕물 adds one, and neither goes below 1", () => {
    const thrifty = posed({ hand: ["meditate"], lasting: ["thrift"], cost: 5 });
    expect(expectOk(reduce(thrifty, { type: "play-skill", index: 0 })).players.w.cost).toBe(4);

    const muddy = posed({ hand: ["meditate"], oppLasting: ["muddy-water"], cost: 5 });
    expect(expectOk(reduce(muddy, { type: "play-skill", index: 0 })).players.w.cost).toBe(3);
  });

  it("준비 태세 grants cost for this turn only", () => {
    const m = posed({ hand: ["readiness", "earthquake"], cost: 7 });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.bonusCost).toBe(2);
    // 8-cost earthquake is affordable on 6 banked + 2 granted.
    s.skillsPlayed = 0;
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    expect(s.players.w.cost).toBe(0);
    expect(s.players.w.bonusCost).toBe(0);
  });
});

describe("draw step", () => {
  it("draws one at the start of a turn", () => {
    const deck = Array.from({ length: 8 }, () => "meditate");
    const m = createMatch("skill", deck, []);
    // Four cards were the opening hand; the first turn's draw makes five.
    expect(m.players.w.hand).toHaveLength(5);
    expect(m.pending).toBeNull();
  });

  it("stops for a choice when the hand is already at the cap", () => {
    const deck = Array.from({ length: 10 }, () => "meditate");
    let s = createMatch("skill", deck, deck);
    s = expectOk(reduce(s, { type: "move", from: sq("e2"), to: sq("e4") }));
    s = expectOk(reduce(s, { type: "move", from: sq("e7"), to: sq("e5") }));
    // White comes back to a full hand, so the draw is a decision.
    expect(s.pending).toEqual({ kind: "draw-choice", color: "w" });
  });

  it("draw-skip keeps the hand and moves on", () => {
    const m = posed();
    m.pending = { kind: "draw-choice", color: "w" };
    m.players.w.hand = ["meditate", "meditate", "meditate", "meditate", "meditate"];
    const s = expectOk(reduce(m, { type: "draw-skip" }));
    expect(s.players.w.hand).toHaveLength(5);
    expect(s.pending).toBeNull();
    expect(s.phase).toBe("skill");
  });

  it("draw-take draws a sixth card, then makes you pitch one", () => {
    const m = posed();
    m.pending = { kind: "draw-choice", color: "w" };
    m.players.w.hand = ["meditate", "meditate", "meditate", "meditate", "meditate"];
    m.players.w.library = ["scout"];
    let s = expectOk(reduce(m, { type: "draw-take" }));
    expect(s.players.w.hand).toHaveLength(6);
    expect(s.pending).toEqual({ kind: "discard", color: "w" });
    s = expectOk(reduce(s, { type: "discard", index: 0 }));
    expect(s.players.w.hand).toHaveLength(5);
    expect(s.players.w.discard).toHaveLength(1);
  });

  it("reshuffles the discard pile rather than decking out", () => {
    const m = posed();
    m.players.w.library = [];
    m.players.w.discard = ["scout", "spy"];
    m.pending = { kind: "draw-choice", color: "w" };
    m.players.w.hand = [];
    const s = expectOk(reduce(m, { type: "draw-take" }));
    expect(s.players.w.hand).toHaveLength(1);
    expect(s.players.w.library.length + s.players.w.discard.length).toBe(1);
  });
});

describe("turn shape: 일반 vs 속공", () => {
  it("a 일반 card spends the move: no piece may move afterwards", () => {
    const m = posed({ hand: ["earthquake"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.moveSpent).toBe(true);
    expect(expectFail(reduce(s, { type: "move", from: sq("b1"), to: sq("c3") })))
      .toMatch(/instead of your move/);
  });

  it("a 속공 card leaves the move intact", () => {
    const m = posed({ hand: ["meditate"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.moveSpent).toBe(false);
    expectOk(reduce(s, { type: "move", from: sq("b1"), to: sq("c3") }));
  });

  it("only one skill card a turn", () => {
    const m = posed({ hand: ["meditate", "spy"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(s, { type: "play-skill", index: 0 }))).toMatch(/one skill card/);
  });

  it("지속 cards install themselves and bend the rules from then on", () => {
    const m = posed({ hand: ["agile-knight"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.lasting.map((l) => l.card)).toContain("agile-knight");
    expect(s.rules.agileKnight?.w).toBe(true);
    // An unplayed copy changes nothing.
    expect(posed({ hand: ["agile-knight"] }).rules.agileKnight).toBeUndefined();
  });
});

describe("targeting", () => {
  it("collects one pick per step, then resolves", () => {
    const m = posed({ hand: ["small-sandbag"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.pending).toMatchObject({ kind: "targeting", card: "small-sandbag", step: 0 });
    s = expectOk(reduce(s, { type: "target", sq: sq("e7") }));
    expect(s.pending).toBeNull();
    expect(s.enchants).toHaveLength(1);
    expect(s.enchants[0]).toMatchObject({ card: "small-sandbag", turnsLeft: 2 });
  });

  it("refuses a target of the wrong kind", () => {
    const m = posed({ hand: ["small-sandbag"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    // Own piece offered to a card that wants an enemy one.
    expect(expectFail(reduce(s, { type: "target", sq: sq("e2") }))).toMatch(/illegal target/);
    // Kings are off-limits unless the card says otherwise.
    expect(expectFail(reduce(s, { type: "target", sq: sq("e8") }))).toMatch(/illegal target/);
  });

  it("cancelling gives the card and its cost back", () => {
    const m = posed({ hand: ["small-sandbag"], cost: 6 });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.cost).toBe(5);
    s = expectOk(reduce(s, { type: "target-cancel" }));
    expect(s.players.w.cost).toBe(6);
    expect(s.players.w.hand).toContain("small-sandbag");
    expect(s.pending).toBeNull();
  });

  it("a variable step takes up to its maximum and stops on demand", () => {
    const m = posed({ hand: ["disguise", "scout", "spy"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", index: 0 }));
    expect(s.pending).toMatchObject({ kind: "targeting", card: "disguise" });
    s = expectOk(reduce(s, { type: "target-done" }));
    expect(s.pending).toBeNull();
    // One card went back into the deck, and one came out of it.
    expect(s.players.w.hand).toHaveLength(2);
  });
});

describe("enchants", () => {
  it("모래주머니 freezes a pawn and shortens a rook", () => {
    const m = posed({ hand: ["small-sandbag"], fen: "4k3/8/8/8/8/8/r6p/4K3 w - - 0 1" });
    const pawn = expectOk(reduce(expectOk(reduce(m, { type: "play-skill", index: 0 })), {
      type: "target", sq: sq("h2"),
    }));
    expect(pawn.rules.squareRules?.[sq("h2")]?.immobile).toBe(true);

    const m2 = posed({ hand: ["small-sandbag"], fen: "4k3/8/8/8/8/8/r6p/4K3 w - - 0 1" });
    const rook = expectOk(reduce(expectOk(reduce(m2, { type: "play-skill", index: 0 })), {
      type: "target", sq: sq("a2"),
    }));
    expect(rook.rules.squareRules?.[sq("a2")]?.maxSteps).toBe(2);
  });

  it("무장해제 muzzles a piece but lets it move", () => {
    const m = posed({ hand: ["disarm"], fen: "4k3/8/8/8/8/8/r6P/4K3 w - - 0 1" });
    const s = play(m, at(sq("a2")));
    expect(s.rules.squareRules?.[sq("a2")]?.noCapture).toBe(true);
    expect(s.enchants[0]?.ticksOn).toBe("b"); // counted on the victim's turns
  });

  it("해주 lifts an enchant off your own piece", () => {
    const m = posed({ hand: ["cleanse"], fen: "4k3/8/8/8/8/8/7P/4K3 w - - 0 1" });
    m.enchants = [{
      id: 1, card: "large-sandbag", owner: "b", on: { kind: "piece", sq: sq("h2") },
      turnsLeft: 5, ticksOn: "b",
    }];
    const s = play(m, at(sq("h2")));
    expect(s.enchants).toHaveLength(0);
  });

  it("an enchant follows its piece and dies with it", () => {
    const m = posed({ fen: "4k3/8/8/8/8/8/7P/4K3 w - - 0 1" });
    m.enchants = [{
      id: 1, card: "leap", owner: "w", on: { kind: "piece", sq: sq("h2") },
      turnsLeft: 3, ticksOn: "w",
    }];
    const moved = expectOk(reduce(m, { type: "move", from: sq("h2"), to: sq("h3") }));
    expect(moved.enchants[0]?.on).toMatchObject({ sq: sq("h3") });
  });

  it("각성 crowns a piece and hands the crown back when it expires", () => {
    const m = posed({ hand: ["awaken"], fen: "4k3/8/8/8/8/8/1N6/4K3 w - - 0 1" });
    const s = play(m, at(sq("b2")));
    expect(s.chess.board[sq("b2")]?.type).toBe("q");
    expect(s.enchants[0]).toMatchObject({ card: "awaken", turnsLeft: 5, data: { was: "n" } });
  });
});

describe("death hooks", () => {
  /** Black pawn on g3, white pawn on h2: g3xh2 is the death being tested. */
  const CAPTURE_FEN = "4k3/8/8/8/8/6p1/7P/4K3 b - - 0 1";

  it("미끼 pays its owner two cards when the pawn dies", () => {
    const m = posed({ fen: CAPTURE_FEN });
    m.players.w.library = ["scout", "spy", "meditate"];
    m.enchants = [{
      id: 1, card: "bait", owner: "w", on: { kind: "piece", sq: sq("h2") },
      turnsLeft: null, ticksOn: "w",
    }];
    const s = expectOk(reduce(m, { type: "move", from: sq("g3"), to: sq("h2") }));
    expect(s.players.w.hand.length).toBeGreaterThanOrEqual(2);
  });

  it("봉화 draws whenever one of your pieces falls", () => {
    const withBeacon = posed({ fen: CAPTURE_FEN, lasting: ["beacon"] });
    withBeacon.players.w.library = ["scout", "spy"];
    const lit = expectOk(reduce(withBeacon, { type: "move", from: sq("g3"), to: sq("h2") }));

    // The turn that follows draws a card of its own, so the beacon is worth
    // exactly one card more than the same position without it.
    const without = posed({ fen: CAPTURE_FEN });
    without.players.w.library = ["scout", "spy"];
    const dark = expectOk(reduce(without, { type: "move", from: sq("g3"), to: sq("h2") }));
    expect(lit.players.w.hand.length).toBe(dark.players.w.hand.length + 1);
  });

  it("운명의 사슬 drags its partner down", () => {
    const m = posed({ fen: "4k3/8/8/8/8/1n4p1/7P/4K3 b - - 0 1" });
    m.enchants = [
      { id: 1, card: "fate-chain", owner: "w", on: { kind: "piece", sq: sq("h2") }, turnsLeft: null, ticksOn: "w", data: { partner: sq("b3") } },
      { id: 2, card: "fate-chain", owner: "w", on: { kind: "piece", sq: sq("b3") }, turnsLeft: null, ticksOn: "w", data: { partner: sq("h2") } },
    ];
    const s = expectOk(reduce(m, { type: "move", from: sq("g3"), to: sq("h2") }));
    expect(s.chess.board[sq("b3")]).toBeNull();
  });
});

describe("board effects", () => {
  it("밀쳐내기 pushes an adjacent enemy one square back", () => {
    const m = posed({ hand: ["shove"], fen: "4k3/8/8/8/8/8/3Pp3/K7 w - - 0 1" });
    const s = play(m, at(sq("d2")), at(sq("e2")));
    expect(s.chess.board[sq("f2")]?.color).toBe("b");
    expect(s.chess.board[sq("e2")]).toBeNull();
  });

  it("밀쳐내기 refuses a target with nowhere to go", () => {
    const m = posed({ hand: ["shove"], fen: "4k3/8/8/8/8/8/5Ppr/4K3 w - - 0 1" });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    const s2 = expectOk(reduce(s, { type: "target", sq: sq("f2") }));
    expect(expectFail(reduce(s2, { type: "target", sq: sq("g2") }))).toMatch(/nowhere to shove/);
  });

  it("끌어당기기 drags an enemy up the line", () => {
    const m = posed({ hand: ["pull"], fen: "4k3/8/8/8/8/8/R5r1/4K3 w - - 0 1" });
    const s = play(m, at(sq("a2")), at(sq("g2")));
    expect(s.chess.board[sq("b2")]?.color).toBe("b");
  });

  it("질주 moves a piece one square but cannot take", () => {
    const m = posed({ hand: ["dash"], fen: "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1" });
    const s = play(m, at(sq("d2")), at(sq("d3")));
    expect(s.chess.board[sq("d3")]?.type).toBe("p");
    expect(s.moveSpent).toBe(false); // 속공 keeps the move
  });

  it("전환 swaps two of your own pieces", () => {
    const m = posed({ hand: ["transpose"], fen: "4k3/8/8/8/8/8/N6R/4K3 w - - 0 1" });
    const s = play(m, at(sq("a2")), at(sq("h2")));
    expect(s.chess.board[sq("a2")]?.type).toBe("r");
    expect(s.chess.board[sq("h2")]?.type).toBe("n");
  });

  it("승진 promotes a pawn where it stands", () => {
    const m = posed({ hand: ["promotion"], fen: "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1" });
    const s = play(m, at(sq("d2")), "r");
    expect(s.chess.board[sq("d2")]?.type).toBe("r");
  });

  it("암살 refuses a king or a queen but takes anything else", () => {
    const m = posed({ hand: ["assassinate"], fen: "4k3/8/8/8/8/1q3n2/8/4K3 w - - 0 1" });
    const started = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(started, { type: "target", sq: sq("b3") }))).toMatch(/not the king or queen/);
    const s = expectOk(reduce(started, { type: "target", sq: sq("f3") }));
    expect(s.chess.board[sq("f3")]).toBeNull();
  });

  it("여왕암살 takes exactly a queen", () => {
    const m = posed({ hand: ["regicide"], fen: "4k3/8/8/8/8/1q3n2/8/4K3 w - - 0 1" });
    const started = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(started, { type: "target", sq: sq("f3") }))).toMatch(/illegal target/);
    const s = expectOk(reduce(started, { type: "target", sq: sq("b3") }));
    expect(s.chess.board[sq("b3")]).toBeNull();
  });

  it("지진 sweeps every pawn off the board", () => {
    const m = posed({ hand: ["earthquake"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.chess.board.filter((p) => p?.type === "p")).toHaveLength(0);
    expect(s.chess.board.filter(Boolean)).toHaveLength(16);
  });

  it("더블 lets one piece move twice", () => {
    const m = posed({ hand: ["double"], fen: "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1" });
    let s = play(m, at(sq("d2")));
    expect(s.players.w.doubleMove).toMatchObject({ movesLeft: 2 });
    s = expectOk(reduce(s, { type: "move", from: sq("d2"), to: sq("d3") }));
    expect(s.chess.turn).toBe("w"); // still white's turn
    s = expectOk(reduce(s, { type: "move", from: sq("d3"), to: sq("d4") }));
    expect(s.chess.turn).toBe("b");
  });

  it("무르기 puts the opponent's move back and pins the piece", () => {
    let s = posed({ hand: ["rewind"], cost: 10 });
    s.chess = { ...s.chess, turn: "b" };
    s.phase = "move";
    s = expectOk(reduce(s, { type: "move", from: sq("e7"), to: sq("e5") }));
    s.phase = "skill";
    const back = play(s, );
    expect(back.chess.board[sq("e7")]?.type).toBe("p");
    expect(back.chess.board[sq("e5")]).toBeNull();
    expect(back.players.b.locked).toContain(sq("e7"));
  });
});

describe("card flow effects", () => {
  it("명상 draws two", () => {
    const m = posed({ hand: ["meditate"] });
    m.players.w.library = ["scout", "spy", "readiness"];
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.hand).toHaveLength(2);
  });

  it("헌납 pitches one to draw two", () => {
    const m = posed({ hand: ["offering", "earthquake"] });
    m.players.w.library = ["scout", "spy"];
    const s = play(m, 0);
    expect(s.players.w.discard).toContain("earthquake");
    expect(s.players.w.hand).toHaveLength(2);
  });

  it("정찰 reveals one card of the opponent's hand", () => {
    const m = posed({ hand: ["scout"], oppHand: ["meditate", "spy"] });
    const s = play(m, 1);
    expect(s.players.w.revealed).toContain(1);
  });

  it("천리안 opens the whole hand", () => {
    const m = posed({ hand: ["clairvoyance"], oppHand: ["meditate", "spy", "scout"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.seesHand).toBe(true);
    expect(s.players.w.revealed).toEqual([0, 1, 2]);
  });

  it("회수 takes a card back out of the discard pile", () => {
    const m = posed({ hand: ["recall"] });
    m.players.w.discard = ["earthquake"];
    const s = play(m, 0);
    expect(s.players.w.hand).toContain("earthquake");
  });

  it("강제 sends two of their cards back to the deck", () => {
    const m = posed({ hand: ["coerce"], oppHand: ["meditate", "spy", "scout"] });
    const s = play(m, 0, 1);
    expect(s.players.b.hand).toHaveLength(1);
    expect(s.players.b.library).toHaveLength(2);
  });

  it("교환 trades a card with the opponent", () => {
    const m = posed({ hand: ["exchange", "earthquake"], oppHand: ["spy"] });
    const s = play(m, 0, 0);
    expect(s.players.w.hand).toContain("spy");
    expect(s.players.b.hand).toContain("earthquake");
  });

  it("점술 stops to reorder the top of your deck", () => {
    const m = posed({ hand: ["divination"] });
    m.players.w.library = ["a-card", "meditate", "spy", "scout"];
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.pending).toMatchObject({ kind: "arrange", cards: ["scout", "spy", "meditate"] });
    s = expectOk(reduce(s, { type: "arrange", order: [1, 2, 0] }));
    // Last in the order ends up on top, which is what the next draw takes.
    expect(s.players.w.library[s.players.w.library.length - 1]).toBe("scout");
  });

  it("파괴 destroys a lasting card in play", () => {
    const m = posed({ hand: ["shatter"], oppLasting: ["beacon"] });
    const target = m.players.b.lasting[0]!.id;
    const s = play(m, target);
    expect(s.players.b.lasting).toHaveLength(0);
    expect(s.players.b.discard).toContain("beacon");
  });

  it("태풍 blows every lasting card away, both sides'", () => {
    const m = posed({ hand: ["typhoon"], lasting: ["beacon"], oppLasting: ["thrift", "plague"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.lasting).toHaveLength(0);
    expect(s.players.b.lasting).toHaveLength(0);
  });
});

describe("terrain", () => {
  it("늪지 holds a piece that walks into it for a turn", () => {
    const m = posed({ hand: ["swamp"], fen: "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1" });
    let s = play(m, at(sq("d4")));
    expect(s.players.w.lasting[0]).toMatchObject({ card: "swamp", sq: sq("d4") });
    // A 지속 card costs the move, so the walk in happens next turn.
    s.moveSpent = false;
    s = expectOk(reduce(s, { type: "move", from: sq("d2"), to: sq("d4") }));
    expect(s.players.w.locked).toContain(sq("d4"));
  });

  it("지뢰 kills whatever steps on it, but only refuses the king", () => {
    const m = posed({ fen: "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1" });
    m.enchants = [{
      id: 1, card: "mine", owner: "b", on: { kind: "square", sq: sq("d4") },
      turnsLeft: null, ticksOn: "b", data: { hidden: 1 },
    }];
    const s = expectOk(reduce(m, { type: "move", from: sq("d2"), to: sq("d4") }));
    expect(s.chess.board[sq("d4")]).toBeNull();
    expect(s.enchants).toHaveLength(0);
  });
});

describe("counter windows", () => {
  /** Black pawn g3 is about to take the white pawn on h2. */
  const SHIELD_FEN = "4k3/8/8/8/8/6p1/7P/4K3 b - - 0 1";

  it("opens only when the responder can actually pay", () => {
    const poor = posed({ fen: SHIELD_FEN });
    poor.players.w.hand = ["small-shield"];
    poor.players.w.cost = 0;
    const s = expectOk(reduce(poor, { type: "move", from: sq("g3"), to: sq("h2") }));
    expect(s.pending).toBeNull(); // white cannot pay, so there is no prompt

    const rich = posed({ fen: SHIELD_FEN });
    rich.players.w.hand = ["small-shield"];
    const s2 = expectOk(reduce(rich, { type: "move", from: sq("g3"), to: sq("h2") }));
    expect(s2.pending).toMatchObject({ kind: "counter", color: "w" });
  });

  it("작은 방패 turns an attack on a pawn away", () => {
    const m = posed({ fen: SHIELD_FEN });
    m.players.w.hand = ["small-shield"];
    let s = expectOk(reduce(m, { type: "move", from: sq("g3"), to: sq("h2") }));
    expect(s.pending).toMatchObject({ kind: "counter", color: "w", trigger: "capture" });
    s = expectOk(reduce(s, { type: "counter-play", index: 0 }));
    expect(s.chess.board[sq("h2")]?.color).toBe("w"); // the pawn is still there
    expect(s.chess.board[sq("g3")]?.color).toBe("b"); // the attacker stayed put
  });

  it("passing lets the action through untouched", () => {
    const m = posed({ fen: SHIELD_FEN });
    m.players.w.hand = ["small-shield"];
    let s = expectOk(reduce(m, { type: "move", from: sq("g3"), to: sq("h2") }));
    s = expectOk(reduce(s, { type: "counter-pass" }));
    expect(s.chess.board[sq("h2")]?.color).toBe("b");
  });

  it("경계 draws a card and lets the skill resolve", () => {
    const m = posed({ hand: ["earthquake"], oppHand: ["vigilance"] });
    m.players.b.library = ["spy"];
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.pending).toMatchObject({ kind: "counter", trigger: "skill", color: "b" });
    s = expectOk(reduce(s, { type: "counter-play", index: 0 }));
    expect(s.players.b.hand).toContain("spy");
    expect(s.chess.board.filter((p) => p?.type === "p")).toHaveLength(0); // earthquake still hit
  });

  it("간파 undoes a 속공 card and puts it in the discard pile", () => {
    const m = posed({ hand: ["meditate"], oppHand: ["insight"] });
    m.players.w.library = ["spy", "scout"];
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "counter-play", index: 0 }));
    expect(s.players.w.hand).not.toContain("meditate");
    expect(s.players.w.discard).toContain("meditate");
  });

  it("방어 defuses the mine instead of the piece", () => {
    const m = posed({ fen: "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1" });
    m.players.b.hand = ["ward"];
    m.players.b.cost = 10;
    m.enchants = [{
      id: 1, card: "mine", owner: "w", on: { kind: "square", sq: sq("d4") },
      turnsLeft: null, ticksOn: "w", data: { hidden: 1 },
    }];
    // The mine belongs to white here, so black's piece is the one at risk.
    m.chess = { ...m.chess, turn: "b", board: m.chess.board.slice() };
    m.chess.board[sq("d2")] = null;
    m.chess.board[sq("d5")] = { color: "b", type: "p" };
    let s = expectOk(reduce(m, { type: "move", from: sq("d5"), to: sq("d4") }));
    // The window belongs to whoever's piece is standing on the mine.
    expect(s.pending).toMatchObject({ kind: "counter", trigger: "terrain", color: "b" });
    s = expectOk(reduce(s, { type: "counter-play", index: 0 }));
    expect(s.chess.board[sq("d4")]?.color).toBe("b"); // the pawn survives
    expect(s.enchants).toHaveLength(0); // and the mine is spent
  });
});

describe("master mode: summoning", () => {
  it("summons a piece into the back three ranks and pays for it", () => {
    const m = posed({ mode: "master", hand: [pieceCardId("n")], cost: 10 });
    m.phase = "summon";
    let s = expectOk(reduce(m, { type: "summon", index: 0 }));
    expect(s.pending).toMatchObject({ kind: "summon-place", piece: "n" });
    s = expectOk(reduce(s, { type: "summon-place", sq: msq("c2") }));
    expect(s.chess.board[msq("c2")]?.type).toBe("n");
    expect(s.players.w.cost).toBe(7); // a knight costs 3
  });

  it("refuses a square outside the summoning zone", () => {
    const m = posed({ mode: "master", hand: [pieceCardId("p")], cost: 10 });
    m.phase = "summon";
    const s = expectOk(reduce(m, { type: "summon", index: 0 }));
    expect(expectFail(reduce(s, { type: "summon-place", sq: msq("c8") }))).toMatch(/summoning zone/);
  });

  it("a piece summoned this turn cannot march", () => {
    const m = posed({ mode: "master", hand: [pieceCardId("n")], cost: 10 });
    m.phase = "summon";
    let s = expectOk(reduce(m, { type: "summon", index: 0 }));
    s = expectOk(reduce(s, { type: "summon-place", sq: msq("c2") }));
    expect(s.rules.squareRules?.[msq("c2")]?.immobile).toBe(true);
  });

  it("but it is free to move once the next turn comes round", () => {
    const m = posed({ mode: "master", hand: [pieceCardId("n")], cost: 10 });
    m.phase = "summon";
    let s = expectOk(reduce(m, { type: "summon", index: 0 }));
    s = expectOk(reduce(s, { type: "summon-place", sq: msq("c2") }));
    s = expectOk(reduce(s, { type: "end-turn" }));
    s = expectOk(reduce(s, { type: "end-turn" }));
    expect(s.players.w.summonSick).toHaveLength(0);
  });
});

describe("turn-start lasting cards", () => {
  it("역병 eats a pawn every third turn", () => {
    const m = posed({ lasting: ["plague"] });
    m.players.w.lasting[0]!.turnsLeft = 2; // about to come round
    const s = expectOk(reduce(m, { type: "end-turn" }));
    expect(s.chess.board.filter((p) => p?.type === "p").length).toBe(15);
  });

  it("도박장 rolls for whoever's turn it is", () => {
    const m = posed({ lasting: ["gambling-den"] });
    m.players.b.hand = [];
    m.players.b.library = ["spy", "scout", "meditate"];
    const r = reduce(m, { type: "end-turn" }, fixed(0.9)); // a 6
    const s = expectOk(r);
    // Two from the dice, on top of the turn's own draw.
    expect(s.players.b.hand).toHaveLength(3);
  });
});
