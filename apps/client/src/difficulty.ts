/**
 * AI difficulty ladders, one per game, named after that game's own pieces.
 *
 * Every rung maps to search parameters rather than to a separate engine: the
 * same code plays every level, it just thinks for less time and is allowed to
 * pick a worse move. `margin` is what actually makes the low rungs beatable —
 * a depth limit alone still plays a clean, if shallow, game.
 *
 * No third-party engine is involved anywhere here. Stockfish and Fairy-Stockfish
 * are both GPL-3.0, which would put obligations on a commercial Steam build, so
 * strength comes from our own search instead.
 */
export type GameId = "chess" | "janggi" | "omok";

export interface LevelDef {
  /** Stable id, used as the saved value — renaming a label must not lose a setting. */
  key: string;
  /** `[en, ko]`, matching the ordering the rest of i18n.ts uses. */
  label: readonly [en: string, ko: string];
  /** Wall-clock thinking budget for one move. */
  timeMs: number;
  maxDepth: number;
  /**
   * Root-score window, in that game's own evaluation units. Any root move
   * scoring within `margin` of the best one is a candidate, and one is chosen at
   * random. 0 means "always play the best move found".
   *
   * A non-zero margin costs pruning — every root move has to be searched with a
   * full window to get an exact score — so it is only used on the shallow rungs
   * where that is affordable.
   */
  margin: number;
  /**
   * Omok only: whether the AI is allowed its "block the opponent's five" reflex.
   * The bottom rung plays without it, which is most of what makes it losable.
   */
  guard?: boolean;
}

/** Chess — ordered as requested: 폰 · 룩 · 비숍 · 나이트 · 퀸 · 킹. */
const CHESS: LevelDef[] = [
  { key: "pawn",   label: ["Pawn", "폰"],       timeMs: 200,  maxDepth: 1,  margin: 400 },
  { key: "rook",   label: ["Rook", "룩"],       timeMs: 400,  maxDepth: 2,  margin: 250 },
  { key: "bishop", label: ["Bishop", "비숍"],   timeMs: 700,  maxDepth: 3,  margin: 140 },
  { key: "knight", label: ["Knight", "나이트"], timeMs: 1200, maxDepth: 4,  margin: 60 },
  { key: "queen",  label: ["Queen", "퀸"],      timeMs: 2500, maxDepth: 12, margin: 0 },
  { key: "king",   label: ["King", "킹"],       timeMs: 5000, maxDepth: 24, margin: 0 },
];

/** Janggi — 쫄(병) · 마 · 상 · 차 · 궁. */
const JANGGI: LevelDef[] = [
  { key: "soldier",  label: ["Soldier", "쫄"],   timeMs: 200,  maxDepth: 1,  margin: 200 },
  { key: "horse",    label: ["Horse", "마"],     timeMs: 500,  maxDepth: 2,  margin: 120 },
  { key: "elephant", label: ["Elephant", "상"],  timeMs: 900,  maxDepth: 3,  margin: 60 },
  { key: "chariot",  label: ["Chariot", "차"],   timeMs: 2200, maxDepth: 6,  margin: 0 },
  { key: "general",  label: ["General", "궁"],   timeMs: 4500, maxDepth: 10, margin: 0 },
];

/** Omok — 돌 · 쌍삼 · 쌍사 · 필별 · 신선. */
const OMOK: LevelDef[] = [
  { key: "stone",    label: ["Stone", "돌"],          timeMs: 200,  maxDepth: 1,  margin: 4000, guard: false },
  { key: "double3",  label: ["Double Three", "쌍삼"], timeMs: 500,  maxDepth: 2,  margin: 1200, guard: true },
  { key: "double4",  label: ["Double Four", "쌍사"],  timeMs: 1100, maxDepth: 4,  margin: 300,  guard: true },
  { key: "certain",  label: ["Certain Kill", "필별"], timeMs: 2600, maxDepth: 8,  margin: 0,    guard: true },
  { key: "immortal", label: ["Immortal", "신선"],     timeMs: 5000, maxDepth: 14, margin: 0,    guard: true },
];

export const LADDERS: Record<GameId, LevelDef[]> = {
  chess: CHESS,
  janggi: JANGGI,
  omok: OMOK,
};

export const isGameId = (id: string): id is GameId => id in LADDERS;

/** Default rung: the middle of the ladder, so a first game is neither trivial nor brutal. */
const defaultIndex = (id: GameId) => Math.floor(LADDERS[id].length / 2);

const storageKey = (id: GameId) => `skill-board:difficulty:${id}`;

export function getLevelIndex(id: GameId): number {
  try {
    const saved = localStorage.getItem(storageKey(id));
    const found = LADDERS[id].findIndex((l) => l.key === saved);
    if (found >= 0) return found;
  } catch {
    /* private mode */
  }
  return defaultIndex(id);
}

export function setLevelIndex(id: GameId, index: number): void {
  const level = LADDERS[id][index];
  if (!level) return;
  try {
    localStorage.setItem(storageKey(id), level.key);
  } catch {
    /* private mode */
  }
}

export function getLevel(id: GameId): LevelDef {
  return LADDERS[id][getLevelIndex(id)]!;
}
