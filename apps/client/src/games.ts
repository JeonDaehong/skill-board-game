import type { Screen } from "./router.js";
import { makeCountdown } from "./screens/countdown.js";
import { makeSkillSelect } from "./screens/skill-select.js";
import { makeChess } from "./chess/controller.js";

/** A game shown in the Single Play carousel. */
export interface GameEntry {
  id: string;
  name: string;
  /** Emoji/glyph shown on the card. */
  icon: string;
  /** Short tagline under the title. */
  tagline: string;
  /** Accent color for the card. */
  color: string;
  /** If set, selecting the game starts this screen (after countdown). null = locked. */
  start: Screen | null;
}

/**
 * The seven carousel slots. Chess is playable now; the rest are placeholders
 * ("준비중" / locked) that we'll fill in as each game gets built.
 */
export const GAMES: GameEntry[] = [
  {
    id: "chess",
    name: "체스",
    icon: "♞",
    tagline: "vs AI",
    color: "#c9a15a",
    // 체스 선택 → 스킬 선택(카드 20개) → 3·2·1 카운트다운 → AI 대국
    start: makeSkillSelect((skills) =>
      makeCountdown(makeChess({ humanColor: "w", depth: 3, skills })),
    ),
  },
  { id: "omok", name: "오목", icon: "⚫", tagline: "준비중", color: "#5a7fc9", start: null },
  { id: "q1", name: "???", icon: "?", tagline: "Coming soon", color: "#6b6f76", start: null },
  { id: "q2", name: "???", icon: "?", tagline: "Coming soon", color: "#6b6f76", start: null },
  { id: "q3", name: "???", icon: "?", tagline: "Coming soon", color: "#6b6f76", start: null },
  { id: "q4", name: "???", icon: "?", tagline: "Coming soon", color: "#6b6f76", start: null },
  { id: "q5", name: "???", icon: "?", tagline: "Coming soon", color: "#6b6f76", start: null },
];
