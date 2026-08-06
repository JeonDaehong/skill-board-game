import { describe, expect, it } from "vitest";
import {
  APEX,
  PLACEMENT_MATCHES,
  RP_LOSS,
  RP_PER_DIVISION,
  RP_WIN,
  TOTAL_DIVISIONS,
  applyResult,
  divisionLabel,
  divisionOf,
  isPlaced,
  type MatchResult,
  type RankState,
} from "./rank.js";

const fresh = (): RankState => ({
  placed: 0, placementWins: 0, index: null, rp: 0, wins: 0, losses: 0, draws: 0,
});

/** A player who is through placements, sitting at `index` with `rp` banked. */
const at = (index: number, rp = 0): RankState => ({
  ...fresh(), placed: PLACEMENT_MATCHES, placementWins: 0, index, rp,
});

const run = (state: RankState, ...results: MatchResult[]): RankState => {
  let s = state;
  for (const r of results) s = applyResult(s, r).after;
  return s;
};

describe("the ladder's shape", () => {
  it("is 5+5+5+5+3+1 divisions, pawn at the bottom and king at the top", () => {
    expect(TOTAL_DIVISIONS).toBe(24);
    expect(divisionOf(0).tier.id).toBe("pawn");
    expect(divisionOf(0).division).toBe(5); // V is the bottom of a tier
    expect(divisionOf(4).tier.id).toBe("pawn");
    expect(divisionOf(4).division).toBe(1);
    expect(divisionOf(5).tier.id).toBe("rook");
    expect(divisionOf(10).tier.id).toBe("bishop");
    expect(divisionOf(15).tier.id).toBe("knight");
    expect(divisionOf(20).tier.id).toBe("queen");
    expect(divisionOf(20).division).toBe(3); // queen starts at III, not V
    expect(divisionOf(APEX).tier.id).toBe("king");
  });

  it("names divisions in roman numerals, and the king without one", () => {
    expect(divisionLabel(0, false)).toBe("Pawn V");
    expect(divisionLabel(4, false)).toBe("Pawn I");
    expect(divisionLabel(12, false)).toBe("Bishop III");
    expect(divisionLabel(22, false)).toBe("Queen I");
    expect(divisionLabel(APEX, false)).toBe("King");
    expect(divisionLabel(APEX, true)).toBe("킹");
  });

  it("clamps an index from outside the ladder", () => {
    expect(divisionOf(-3).tier.id).toBe("pawn");
    expect(divisionOf(999).tier.id).toBe("king");
  });
});

describe("placements", () => {
  it("names no rank until five matches are in", () => {
    let s = fresh();
    for (let i = 1; i < PLACEMENT_MATCHES; i++) {
      s = applyResult(s, "win").after;
      expect(isPlaced(s)).toBe(false);
      expect(s.index).toBeNull();
    }
    const last = applyResult(s, "win");
    expect(last.placedNow).toBe(true);
    expect(isPlaced(last.after)).toBe(true);
  });

  it("starts higher the better the placement record", () => {
    const swept = run(fresh(), "win", "win", "win", "win", "win");
    const lost = run(fresh(), "loss", "loss", "loss", "loss", "loss");
    expect(swept.index!).toBeGreaterThan(lost.index!);
    expect(lost.index).toBe(0); // the floor, not below it
    // A clean sweep is a head start, not a shortcut to the top.
    expect(swept.index!).toBeLessThan(APEX);
  });

  it("moves no rating while placing", () => {
    const change = applyResult(fresh(), "win");
    expect(change.delta).toBe(0);
    expect(change.after.rp).toBe(0);
    expect(change.after.wins).toBe(1);
  });
});

describe("climbing and falling", () => {
  it("banks rating for a win and promotes at a hundred", () => {
    const change = applyResult(at(3, RP_PER_DIVISION - RP_WIN), "win");
    expect(change.promoted).toBe(true);
    expect(change.after.index).toBe(4);
    expect(change.after.rp).toBe(0);
  });

  it("carries the overflow into the new division", () => {
    const change = applyResult(at(3, RP_PER_DIVISION - 1), "win");
    expect(change.after.index).toBe(4);
    expect(change.after.rp).toBe(RP_WIN - 1);
  });

  it("demotes partway down rather than to the floor of the division", () => {
    const change = applyResult(at(7, 0), "loss");
    expect(change.demoted).toBe(true);
    expect(change.after.index).toBe(6);
    expect(change.after.rp).toBeGreaterThan(0);
    // And the drop cannot immediately cascade into another one.
    expect(applyResult(change.after, "loss").demoted).toBe(false);
  });

  it("cannot fall out of the bottom of the ladder", () => {
    const change = applyResult(at(0, 0), "loss");
    expect(change.after.index).toBe(0);
    expect(change.after.rp).toBe(0);
    expect(change.demoted).toBe(false);
  });

  it("keeps accumulating at the top instead of promoting past it", () => {
    const change = applyResult(at(APEX, 980), "win");
    expect(change.after.index).toBe(APEX);
    expect(change.after.rp).toBe(980 + RP_WIN);
    expect(change.promoted).toBe(false);
  });

  it("leaves the rating alone on a draw but still counts the match", () => {
    const change = applyResult(at(5, 40), "draw");
    expect(change.delta).toBe(0);
    expect(change.after.rp).toBe(40);
    expect(change.after.draws).toBe(1);
  });

  it("rewards a win more than it punishes a loss, so holding even climbs", () => {
    expect(RP_WIN).toBeGreaterThan(RP_LOSS);
    const evens = run(at(2, 50), "win", "loss", "win", "loss");
    expect(evens.rp + evens.index! * RP_PER_DIVISION)
      .toBeGreaterThan(50 + 2 * RP_PER_DIVISION);
  });

  it("never mutates the state handed to it", () => {
    const before = at(4, 90);
    applyResult(before, "win");
    expect(before).toEqual(at(4, 90));
  });
});
