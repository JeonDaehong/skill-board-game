/**
 * The competitive ladder.
 *
 * Six tiers named after the pieces, climbing in the order the game itself
 * teaches them — pawn, rook, bishop, knight, queen, king. The lower four each
 * hold five divisions counted down in roman numerals (V is the bottom of a
 * tier, I the top); queen holds three; king holds one, and there is nothing
 * above it, so a king's rating keeps climbing as a raw score.
 *
 * Everything here is local. There is no account server yet, so a rank is a
 * record of matches this browser has played — which is the same shape the real
 * thing will have when it arrives, just with a different place to keep it.
 */
export type TierId = "pawn" | "rook" | "bishop" | "knight" | "queen" | "king";

export interface Tier {
  id: TierId;
  /** Divisions in this tier, counted down from this number to I. */
  divisions: number;
  /** Sprite code for the piece that names it, for the emblem. */
  sprite: string;
  name: readonly [en: string, ko: string];
}

export const TIERS: Tier[] = [
  { id: "pawn", divisions: 5, sprite: "wp", name: ["Pawn", "폰"] },
  { id: "rook", divisions: 5, sprite: "wr", name: ["Rook", "룩"] },
  { id: "bishop", divisions: 5, sprite: "wb", name: ["Bishop", "비숍"] },
  { id: "knight", divisions: 5, sprite: "wn", name: ["Knight", "나이트"] },
  { id: "queen", divisions: 3, sprite: "wq", name: ["Queen", "퀸"] },
  { id: "king", divisions: 1, sprite: "wk", name: ["King", "킹"] },
];

/** Every division, bottom to top: 5+5+5+5+3+1. */
export const TOTAL_DIVISIONS = TIERS.reduce((n, t) => n + t.divisions, 0);
/** The single division at the top, where rating stops resetting. */
export const APEX = TOTAL_DIVISIONS - 1;

export interface Division {
  index: number;
  tier: Tier;
  /** Roman-numeral rung inside the tier: 5 is the bottom, 1 the top. */
  division: number;
}

/** Which tier and rung a division index lands on. */
export function divisionOf(index: number): Division {
  let left = Math.max(0, Math.min(APEX, Math.round(index)));
  for (const tier of TIERS) {
    if (left < tier.divisions) {
      // Within a tier the index climbs while the numeral counts down.
      return { index, tier, division: tier.divisions - left };
    }
    left -= tier.divisions;
  }
  const king = TIERS[TIERS.length - 1]!;
  return { index: APEX, tier: king, division: 1 };
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

export function divisionLabel(index: number, ko: boolean): string {
  const d = divisionOf(index);
  const name = ko ? d.tier.name[1] : d.tier.name[0];
  // King has one division, so "King I" would be saying the same thing twice.
  return d.tier.divisions === 1 ? name : `${name} ${ROMAN[d.division]}`;
}

// ── the numbers ─────────────────────────────────────────────
/** Rating needed to climb one division. */
export const RP_PER_DIVISION = 100;
/** Won matches are worth a little more than lost ones cost, so a player who
 *  holds their own over time drifts up rather than standing still. */
export const RP_WIN = 25;
export const RP_LOSS = 18;
/** Where a demotion drops you inside the division below — not to the floor, so
 *  one bad match cannot cost two divisions in a row. */
const DEMOTE_TO = 75;

/** Matches played before the ladder will name a rank. */
export const PLACEMENT_MATCHES = 5;
/**
 * Where each placement record starts you. Winning out lands in the middle of
 * bronze rather than at the top of the ladder: placements are a guess, and the
 * climb is supposed to be the game.
 */
const PLACEMENT_START = [0, 2, 4, 6, 8, 10];

export interface RankState {
  /** Placement matches completed, capped at PLACEMENT_MATCHES. */
  placed: number;
  placementWins: number;
  /** Division index, or null while still in placements. */
  index: number | null;
  rp: number;
  wins: number;
  losses: number;
  draws: number;
}

export type MatchResult = "win" | "loss" | "draw";

const KEY = "skill-board:rank:v1";

const fresh = (): RankState => ({
  placed: 0, placementWins: 0, index: null, rp: 0, wins: 0, losses: 0, draws: 0,
});

const clampInt = (v: unknown, lo: number, hi: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

export function loadRank(): RankState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<RankState>;
    const placed = clampInt(p.placed, 0, PLACEMENT_MATCHES);
    // Clamped on read: the ladder's shape can change between builds, and a
    // saved index past the top would otherwise read as a rank that is gone.
    const ranked = placed >= PLACEMENT_MATCHES && p.index !== null && p.index !== undefined;
    return {
      placed,
      placementWins: clampInt(p.placementWins, 0, placed),
      index: ranked ? clampInt(p.index, 0, APEX) : null,
      rp: clampInt(p.rp, 0, Number.MAX_SAFE_INTEGER),
      wins: clampInt(p.wins, 0, Number.MAX_SAFE_INTEGER),
      losses: clampInt(p.losses, 0, Number.MAX_SAFE_INTEGER),
      draws: clampInt(p.draws, 0, Number.MAX_SAFE_INTEGER),
    };
  } catch {
    return fresh();
  }
}

export function saveRank(state: RankState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode: the ladder just does not persist */
  }
}

/** What one ranked match did to the ladder, for the screen that reports it. */
export interface RankChange {
  before: RankState;
  after: RankState;
  /** Rating gained or lost. Zero during placements, which have no rating. */
  delta: number;
  promoted: boolean;
  demoted: boolean;
  /** This match was the one that finished placements. */
  placedNow: boolean;
}

/**
 * Apply a ranked result. Placements come first and carry no rating: they only
 * decide where the climb starts. After that a win is rating toward the next
 * division and a loss is rating off the current one, with a demotion landing
 * partway down rather than at the bottom.
 */
export function applyResult(before: RankState, result: MatchResult): RankChange {
  const after: RankState = { ...before };
  if (result === "win") after.wins += 1;
  else if (result === "loss") after.losses += 1;
  else after.draws += 1;

  let placedNow = false;
  if (before.placed < PLACEMENT_MATCHES) {
    after.placed = before.placed + 1;
    if (result === "win") after.placementWins = before.placementWins + 1;
    if (after.placed >= PLACEMENT_MATCHES) {
      after.index = PLACEMENT_START[after.placementWins] ?? 0;
      after.rp = 0;
      placedNow = true;
    }
    return { before, after, delta: 0, promoted: false, demoted: false, placedNow };
  }

  const delta = result === "win" ? RP_WIN : result === "loss" ? -RP_LOSS : 0;
  let index = before.index ?? 0;
  let rp = before.rp + delta;
  let promoted = false;
  let demoted = false;

  if (index >= APEX) {
    // Nothing above the king: rating simply accumulates as a score.
    after.index = APEX;
    after.rp = Math.max(0, rp);
    return { before, after, delta, promoted: false, demoted: false, placedNow: false };
  }

  while (rp >= RP_PER_DIVISION && index < APEX) {
    rp -= RP_PER_DIVISION;
    index += 1;
    promoted = true;
  }
  if (rp < 0) {
    if (index > 0) {
      index -= 1;
      rp = DEMOTE_TO;
      demoted = true;
    } else {
      rp = 0; // the floor of the ladder: you cannot fall out of it
    }
  }

  after.index = index;
  after.rp = rp;
  return { before, after, delta, promoted, demoted, placedNow: false };
}

/** Apply a ranked result and persist it. */
export function recordRanked(result: MatchResult): RankChange {
  const change = applyResult(loadRank(), result);
  saveRank(change.after);
  return change;
}

/** True once the ladder will actually name a rank. */
export const isPlaced = (s: RankState): boolean =>
  s.placed >= PLACEMENT_MATCHES && s.index !== null;

/** Progress toward the next division, 0–1. The apex has nothing to fill. */
export function divisionProgress(s: RankState): number {
  if (!isPlaced(s) || s.index === null || s.index >= APEX) return 1;
  return Math.max(0, Math.min(1, s.rp / RP_PER_DIVISION));
}
