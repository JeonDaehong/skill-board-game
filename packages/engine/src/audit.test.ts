/**
 * The 2026-08-07 sweep: every card read against docs/skill.md, and a test for
 * each place the two disagreed.
 *
 * These are regression tests, not coverage — `skill-coverage.test.ts` already
 * plays all sixty-three cards and checks that each leaves a mark. What it
 * cannot see is a card that resolves cleanly and does the *wrong* thing, which
 * is what all of these were: a lock that was cleared before it could bite, a
 * hand index that meant something different by the time it was used, a limit
 * applied to cards the rules exempt.
 */
import { describe, expect, it } from "vitest";
import { algebraicToSquare, generateLegalMoves, parseFen } from "@skill/chess-core";
import { createMatch, deriveRules } from "./match.js";
import { reduce } from "./reduce.js";
import type { LastingCard, MatchState } from "./types.js";

const sq = algebraicToSquare;

function expectOk(r: ReturnType<typeof reduce>): MatchState {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.state;
}
function expectFail(r: ReturnType<typeof reduce>): string {
  if (r.ok) throw new Error("expected the action to be rejected");
  return r.error;
}

interface Setup {
  fen?: string;
  hand?: string[];
  oppHand?: string[];
  lasting?: LastingCard[];
  oppLasting?: LastingCard[];
  cost?: number;
}

function posed(s: Setup = {}): MatchState {
  const m = createMatch("skill", [], []);
  if (s.fen) m.chess = parseFen(s.fen);
  m.players.w.hand = [...(s.hand ?? [])];
  m.players.b.hand = [...(s.oppHand ?? [])];
  m.players.w.lasting = s.lasting ?? [];
  m.players.b.lasting = s.oppLasting ?? [];
  m.players.w.cost = s.cost ?? 10;
  m.players.b.cost = s.cost ?? 10;
  m.pending = null;
  m.phase = "skill";
  m.rules = deriveRules(m);
  return m;
}

const atMove = (s: MatchState): MatchState => ({ ...s, phase: "move" });

/** Can the piece on `from` legally go anywhere at all right now? */
const canMove = (s: MatchState, from: number): boolean =>
  generateLegalMoves(s.chess, from, s.rules).length > 0;

// ═══ 1 cost ════════════════════════════════════════════════
describe("속공 — the one-card-a-turn limit does not apply", () => {
  // docs/skill.md: "속공 | 코스트만 있으면 다른 카드와 함께 사용 가능."
  // The limit counted every card, which made 준비 태세 (+2 cost this turn) a
  // card that granted cost you were then forbidden from spending — and turned
  // every 1-cost cantrip into "your card for the turn".
  it("plays two quick cards in one turn", () => {
    const m = posed({ hand: ["readiness", "meditate"], cost: 4 });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.players.w.bonusCost).toBe(2);
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    expect(s.players.w.discard).toContain("meditate");
  });

  it("준비 태세's cost is actually spendable this turn", () => {
    // 5 banked cannot pay for a 6-cost card…
    expect(expectFail(reduce(posed({ hand: ["awaken"], cost: 5 }), { type: "play-skill", index: 0 })))
      .toMatch(/not enough cost/);
    // …but 5 banked, less the 1 준비 태세 costs, plus the 2 it grants, can.
    const m = posed({ hand: ["readiness", "awaken"], cost: 5 });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", sq: sq("b1") }));
    expect(s.chess.board[sq("b1")]?.type).toBe("q");
  });

  it("still allows only one 일반·부여·지속 card a turn", () => {
    const m = posed({ hand: ["earthquake", "typhoon"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(s, { type: "play-skill", index: 0 }))).toMatch(/one skill card/);
  });

  it("a quick card after a normal one is still allowed", () => {
    // 일반 spends the move, not the right to play another card.
    const m = posed({ hand: ["earthquake", "meditate"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.moveSpent).toBe(true);
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    expect(s.players.w.discard).toContain("meditate");
  });
});

describe("정찰·천리안 — what you looked at stays what you looked at", () => {
  // `revealed` is a list of indices into the opponent's hand, and their hand
  // renumbers itself every time they play a card. Scouting their third card and
  // watching them play their first left you looking at a card you never saw.
  it("follows the card when the opponent plays from in front of it", () => {
    const m = posed({ hand: ["scout"], oppHand: ["meditate", "spy", "earthquake"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", index: 2 })); // 3rd card: earthquake
    expect(s.players.w.revealed).toEqual([2]);

    // Black takes their turn and plays their first card.
    s = { ...s, chess: { ...s.chess, turn: "b" }, phase: "skill", pending: null };
    s.players.b.cost = 10;
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    expect(s.players.b.hand).toEqual(["spy", "earthquake"]);
    // earthquake is now index 1 — and that is what白 should be looking at.
    expect(s.players.w.revealed).toEqual([1]);
  });

  it("forgets a card that leaves the hand entirely", () => {
    const m = posed({ hand: ["scout"], oppHand: ["meditate", "spy"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", index: 0 }));
    s = { ...s, chess: { ...s.chess, turn: "b" }, phase: "skill", pending: null };
    s.players.b.cost = 10;
    s = expectOk(reduce(s, { type: "play-skill", index: 0 })); // plays the scouted card
    expect(s.players.w.revealed).toEqual([]);
  });
});

describe("위장 — two picks of the same card do not eat a third", () => {
  // The handler removed picks by `indexOf(id)`, so a card picked twice was
  // looked up twice; the second lookup missed and `splice(-1, 1)` quietly threw
  // away the last card in hand instead.
  it("refuses the same hand index twice", () => {
    const m = posed({ hand: ["disguise", "meditate", "spy", "earthquake"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", index: 0 }));
    expect(expectFail(reduce(s, { type: "target", index: 0 }))).toMatch(/already picked/);
  });

  it("puts back exactly what was picked", () => {
    const m = posed({ hand: ["disguise", "meditate", "spy", "earthquake"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", index: 0 })); // meditate
    s = expectOk(reduce(s, { type: "target", index: 1 })); // earthquake (spy shifted? no — index is live)
    expect(s.pending).toBeNull();
    // Two went to the deck, two came back: the hand is the size it started.
    expect(s.players.w.hand).toHaveLength(3);
  });
});

describe("강요 — two picks of the same card in the opponent's hand", () => {
  it("refuses the duplicate rather than taking a card they did not pick", () => {
    const m = posed({ hand: ["coerce"], oppHand: ["meditate", "spy", "earthquake"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    const one = expectOk(reduce(s, { type: "target", index: 1 }));
    expect(expectFail(reduce(one, { type: "target", index: 1 }))).toMatch(/already picked/);
  });
});

// ═══ 2 cost ════════════════════════════════════════════════
describe("늪지 — the lock lasts into the next turn", () => {
  // docs/skill.md: "그 칸에 들어온 기물은 다음 턴 이동 불가". The lock was written
  // into `players[victim].locked`, and `beginTurn` cleared that list as the
  // victim's next turn opened — before the rules were derived from it. The
  // piece was pinned for the remainder of the turn it had already moved in,
  // which is no turns at all.
  it("pins the piece that walked in for its next turn", () => {
    const m = posed({ oppLasting: [{ id: 1, card: "swamp", owner: "b", sq: sq("e4") }] });
    let s = expectOk(reduce(atMove(m), { type: "move", from: sq("e2"), to: sq("e4") }));
    // Black's reply, then白 is on move again.
    s = expectOk(reduce(atMove(s), { type: "move", from: sq("d7"), to: sq("d5") }));
    expect(s.chess.turn).toBe("w");
    expect(canMove(s, sq("e4"))).toBe(false);
  });

  it("lets it go the turn after", () => {
    const m = posed({ oppLasting: [{ id: 1, card: "swamp", owner: "b", sq: sq("e4") }] });
    let s = expectOk(reduce(atMove(m), { type: "move", from: sq("e2"), to: sq("e4") }));
    s = expectOk(reduce(atMove(s), { type: "move", from: sq("d7"), to: sq("d5") }));
    s = expectOk(reduce(atMove(s), { type: "move", from: sq("a2"), to: sq("a3") })); // 白 moves something else
    s = expectOk(reduce(atMove(s), { type: "move", from: sq("a7"), to: sq("a6") }));
    expect(canMove(s, sq("e4"))).toBe(true);
  });
});

// ═══ 3 cost ════════════════════════════════════════════════
describe("투창 — the king is not a target", () => {
  // Every other kill card in the game spells out that the king is off limits;
  // 투창's target spec said `king: true`, so a 3-cost card could take the enemy
  // king off the board and leave the match with no king to mate.
  it("will not aim at the enemy king", () => {
    // 白 K e1 and a pawn on e2; 黑 K e8 with a rook on e5 in front of it, so
    // the card has a legal target and the king is a *choice* being refused
    // rather than the only square left.
    const m = posed({ fen: "4k3/8/8/4r3/8/8/4P3/4K3 w - - 0 1", hand: ["javelin"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    const aimed = expectOk(reduce(s, { type: "target", sq: sq("e2") }));
    expect(expectFail(reduce(aimed, { type: "target", sq: sq("e8") }))).toMatch(/illegal target/);
    // The rook it can actually hit dies, and the pawn goes with it.
    const thrown = expectOk(reduce(aimed, { type: "target", sq: sq("e5") }));
    expect(thrown.chess.board[sq("e5")]).toBeFalsy();
    expect(thrown.chess.board[sq("e2")]).toBeFalsy();
  });
});

// ═══ 5 cost ════════════════════════════════════════════════
describe("무르기 — the rewound piece is held for a turn", () => {
  // docs/skill.md: "상대는 다음 한 턴 동안 그 기물을 움직일 수 없음". Same clearing
  // bug as 늪지: the lock went on the opponent and their own `beginTurn` wiped
  // it a moment later.
  it("stops them replaying the move they just took back", () => {
    let s = posed({ hand: ["rewind"] });
    s = expectOk(reduce(atMove(s), { type: "move", from: sq("a2"), to: sq("a3") }));
    s = expectOk(reduce(atMove(s), { type: "move", from: sq("e7"), to: sq("e5") }));
    // 白 rewinds it: the pawn is back on e7.
    s = { ...s, phase: "skill" };
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    expect(s.chess.board[sq("e7")]?.type).toBe("p");
    expect(s.chess.board[sq("e5")]).toBeFalsy();
    // Hand it back to black; the rewound pawn may not move.
    s = expectOk(reduce(s, { type: "end-turn" }));
    expect(s.chess.turn).toBe("b");
    expect(canMove(s, sq("e7"))).toBe(false);
    // Their other pieces are free.
    expect(canMove(s, sq("d7"))).toBe(true);
  });
});

describe("희생의 대가 — the pieces it may spend", () => {
  // docs/skill.md: "킹·폰을 제외한 내 기물 1개를 파괴". The spec accepted any
  // piece and the handler refused kings and pawns after the fact, so picking a
  // pawn spent the cost and dead-ended on an error the player could not read.
  it("will not accept a pawn", () => {
    const m = posed({ hand: ["blood-price"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(s, { type: "target", sq: sq("e2") }))).toMatch(/illegal target/);
  });

  it("accepts a knight", () => {
    const m = posed({ hand: ["blood-price"] });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", sq: sq("b1") }));
    expect(s.chess.board[sq("b1")]).toBeFalsy();
    expect(s.pending).toMatchObject({ kind: "free-moves", movesLeft: 3 });
  });
});

// ═══ 6 cost ════════════════════════════════════════════════
describe("파괴 — a lasting card and a hand card are told apart", () => {
  // The card takes either "a lasting card in play" or "a card in their hand",
  // and both arrived as a bare number: lasting ids count from 1, hand indices
  // from 0. Aiming at their second card destroyed whichever lasting card
  // happened to have been played first.
  it("takes the hand card that was aimed at, not a lasting card with that id", () => {
    const m = posed({
      hand: ["shatter"],
      oppHand: ["meditate", "spy", "earthquake"],
      oppLasting: [{ id: 1, card: "thrift", owner: "b" }],
    });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", index: 1 })); // their 2nd card: spy
    expect(s.players.b.hand).toEqual(["meditate", "earthquake"]);
    expect(s.players.b.lasting).toHaveLength(1); // 절약 untouched
  });

  it("takes a lasting card when that is what was aimed at", () => {
    const m = posed({
      hand: ["shatter"],
      oppHand: ["meditate", "spy"],
      oppLasting: [{ id: 1, card: "thrift", owner: "b" }],
    });
    let s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", lasting: 1 }));
    expect(s.players.b.lasting).toHaveLength(0);
    expect(s.players.b.hand).toEqual(["meditate", "spy"]); // hand untouched
  });
});

describe("각성 — the pieces it may crown", () => {
  it("will not accept a queen", () => {
    const m = posed({ hand: ["awaken"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(s, { type: "target", sq: sq("d1") }))).toMatch(/illegal target/);
  });
});

// ═══ 7 cost ════════════════════════════════════════════════
describe("대혼란 — nobody is lost in the shuffle", () => {
  // Pieces were dealt into whatever squares of their own two home ranks were
  // free, and any that ran out of room were simply dropped on the floor —
  // silently, with no `slain` event and no way to tell it had happened.
  it("puts back exactly as many pieces as it picked up", () => {
    const m = posed({ hand: ["pandemonium"] });
    const before = m.chess.board.filter(Boolean).length;
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.chess.board.filter(Boolean)).toHaveLength(before);
  });

  it("keeps everyone even when the home ranks are occupied by the other side", () => {
    // Black rooks parked on白's back rank leave白 two squares short.
    const m = posed({
      fen: "4k3/8/8/8/8/8/PPPPPPPP/rrr1K3 w - - 0 1",
      hand: ["pandemonium"],
    });
    const before = m.chess.board.filter(Boolean).length;
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(s.chess.board.filter(Boolean)).toHaveLength(before);
  });
});

describe("암살 — the queen is not a target", () => {
  it("refuses the enemy queen at the targeting step", () => {
    const m = posed({ hand: ["assassinate"] });
    const s = expectOk(reduce(m, { type: "play-skill", index: 0 }));
    expect(expectFail(reduce(s, { type: "target", sq: sq("d8") }))).toMatch(/illegal target/);
  });
});

// ═══ every card that touches a rook ════════════════════════
describe("castling survives the cards", () => {
  // Castling rights are a promise that nothing has moved, and in plain chess
  // only a move can break it — so the flag and the board can never disagree.
  // Cards break it constantly: 암살 kills the rook where it stands, 질주 walks
  // it off the corner, 대혼란 shuffles it into the middle. None of them goes
  // through `applyMove`, so the flag outlived its rook and castling still ran:
  // the king landed on c1 and the empty a1 square was moved onto d1.
  it("will not castle queenside after the rook is assassinated", () => {
    // 白 to move with 암살; the target is 黑's a8 rook, and then it is 黑 who
    // must not be able to castle.
    let s = posed({
      fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      hand: ["assassinate"],
    });
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", sq: sq("a8") }));
    expect(s.chess.board[sq("a8")]).toBeFalsy();
    s = expectOk(reduce(s, { type: "end-turn" }));

    const kingMoves = generateLegalMoves(s.chess, sq("e8"), s.rules);
    expect(kingMoves.some((m) => m.flags.includes("castle-queen"))).toBe(false);
    // The kingside rook is still there, so that side is untouched.
    expect(kingMoves.some((m) => m.flags.includes("castle-king"))).toBe(true);
  });

  it("will not castle kingside after the rook dashes off the corner", () => {
    let s = posed({ fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", hand: ["dash"] });
    s = expectOk(reduce(s, { type: "play-skill", index: 0 }));
    s = expectOk(reduce(s, { type: "target", sq: sq("h1") }));
    s = expectOk(reduce(s, { type: "target", sq: sq("h2") }));
    expect(s.chess.board[sq("h1")]).toBeFalsy();

    const kingMoves = generateLegalMoves(s.chess, sq("e1"), s.rules);
    expect(kingMoves.some((m) => m.flags.includes("castle-king"))).toBe(false);
    expect(kingMoves.some((m) => m.flags.includes("castle-queen"))).toBe(true);
  });
});
