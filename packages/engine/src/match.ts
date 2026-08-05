import {
  getStatus,
  initialState,
  masterInitialState,
  opposite,
  type Color,
  type SkillRules,
  type SquareRule,
  type Square,
} from "@skill/chess-core";
import { skillMeta } from "./skills.js";
import { isPieceCard } from "./cards.js";
import { modeRules, usesCards, type GameMode } from "./modes.js";
import type { Enchant, MatchEvent, MatchState, Phase, PlayerState, Rng } from "./types.js";

const COLORS: Color[] = ["w", "b"];

/** Fisher-Yates, driven by the match's own rng so a replay is reproducible. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function makePlayer(color: Color, deck: string[], rng: Rng): PlayerState {
  // Unknown ids are dropped here rather than at play time, so a deck saved
  // against an older card list can still start a match.
  const legal = deck.filter((id) => isPieceCard(id) || skillMeta(id));
  return {
    color,
    library: shuffle(legal, rng),
    hand: [],
    discard: [],
    cost: 0,
    bonusCost: 0,
    lasting: [],
    summonSick: [],
    locked: [],
    revealed: [],
    seesHand: false,
    seenTop: null,
    doubleMove: null,
    freeMoves: 0,
  };
}

/**
 * Draw one card. An exhausted library is refilled from the discard pile rather
 * than losing the game: a chess match can run far longer than thirty cards, and
 * decking out would decide games by attrition instead of by the board.
 * Returns the card drawn, or null when there is genuinely nothing left.
 */
export function drawCard(p: PlayerState, rng: Rng): string | null {
  if (p.library.length === 0) {
    if (p.discard.length === 0) return null;
    p.library = shuffle(p.discard, rng);
    p.discard = [];
  }
  return p.library.pop() ?? null;
}

/** Create a fresh match. `white`/`black` are the players' deck lists. */
export function createMatch(
  mode: GameMode,
  white: string[],
  black: string[],
  rng: Rng = Math.random,
): MatchState {
  const cfg = modeRules(mode);
  const state: MatchState = {
    mode,
    chess: mode === "master" ? masterInitialState() : initialState(),
    rules: {},
    players: { w: makePlayer("w", white, rng), b: makePlayer("b", black, rng) },
    phase: usesCards(mode) ? "draw" : "move",
    moveSpent: false,
    skillsPlayed: 0,
    enchants: [],
    nextEffectId: 1,
    pending: null,
    undo: null,
    status: "playing",
    winner: null,
  };

  for (const color of COLORS) {
    const p = state.players[color];
    for (let i = 0; i < cfg.openingHand; i++) {
      const card = drawCard(p, rng);
      if (card) p.hand.push(card);
    }
  }

  state.rules = deriveRules(state);
  // White's very first turn still collects its cost and runs its draw step.
  if (usesCards(mode)) beginTurn(state, "w", [], rng);
  return state;
}

/** Deep, structuredClone-based copy so reducers never mutate the input. */
export function cloneMatch(state: MatchState): MatchState {
  return structuredClone(state);
}

// ── enchant helpers ─────────────────────────────────────────
/** Every enchant currently attached to the piece standing on `sq`. */
export function enchantsOn(state: MatchState, sq: Square): Enchant[] {
  return state.enchants.filter((e) => e.on.kind !== "player" && e.on.sq === sq);
}

/** Add an enchant and hand back its id. */
export function addEnchant(state: MatchState, e: Omit<Enchant, "id">): Enchant {
  const full: Enchant = { ...e, id: state.nextEffectId++ };
  state.enchants.push(full);
  return full;
}

/** Drop enchants by predicate, reporting how many went. */
export function removeEnchants(state: MatchState, pred: (e: Enchant) => boolean): number {
  const before = state.enchants.length;
  state.enchants = state.enchants.filter((e) => !pred(e));
  return before - state.enchants.length;
}

/** True if either side has this lasting card in play. */
export function lastingInPlay(state: MatchState, card: string, owner?: Color): boolean {
  for (const color of COLORS) {
    if (owner && color !== owner) continue;
    if (state.players[color].lasting.some((l) => l.card === card)) return true;
  }
  return false;
}

/**
 * What one enchant does to the piece it sits on. Movement-altering cards all
 * funnel through here, which is what keeps `deriveRules` a single loop rather
 * than a per-card cascade.
 */
function ruleForEnchant(e: Enchant, pieceType: string | undefined): SquareRule | null {
  switch (e.card) {
    case "small-sandbag":
    case "large-sandbag":
      // The sandbag weighs differently on every kind of piece.
      if (pieceType === "p") return { immobile: true };
      if (pieceType === "n") return { noJump: true };
      if (pieceType === "q" || pieceType === "b" || pieceType === "r") return { maxSteps: 2 };
      return null;
    case "leap":
      return { mayJump: true };
    case "guard-drill":
      return { freeStep: true };
    case "disarm":
      return { noCapture: true };
    case "bond-chain": {
      // Linked pieces cannot take each other; the partner rides along as data.
      const partner = typeof e.data?.partner === "number" ? e.data.partner : null;
      return partner === null ? null : { noCaptureOn: [partner] };
    }
    default:
      return null;
  }
}

function mergeRule(a: SquareRule | undefined, b: SquareRule): SquareRule {
  if (!a) return { ...b };
  return {
    immobile: a.immobile || b.immobile,
    maxSteps: Math.min(a.maxSteps ?? Infinity, b.maxSteps ?? Infinity),
    noJump: a.noJump || b.noJump,
    noCapture: a.noCapture || b.noCapture,
    mayJump: a.mayJump || b.mayJump,
    freeStep: a.freeStep || b.freeStep,
    noCaptureOn: [...(a.noCaptureOn ?? []), ...(b.noCaptureOn ?? [])],
  };
}

/**
 * Build the SkillRules the chess engine reads, from the cards actually in play:
 * 지속 cards for the standing rules, enchants for what is stuck to individual
 * pieces, plus this turn's temporary locks.
 */
export function deriveRules(state: MatchState): SkillRules {
  const rules: SkillRules = {};
  if (modeRules(state.mode).pieceCards) rules.summonable = true;

  const squareRules: Record<Square, SquareRule> = {};
  const put = (sq: Square, rule: SquareRule) => {
    squareRules[sq] = mergeRule(squareRules[sq], rule);
  };

  for (const color of COLORS) {
    const p = state.players[color];
    for (const l of p.lasting) {
      if (l.card === "agile-knight") {
        rules.agileKnight = { ...rules.agileKnight, [color]: true };
      }
    }
    // Pieces held down for the turn — a swamp, or a move that was rewound.
    for (const sq of p.locked) put(sq, { immobile: true });
    // A piece summoned this turn holds its square but cannot march yet.
    for (const sq of p.summonSick) put(sq, { immobile: true });
  }

  for (const e of state.enchants) {
    if (e.on.kind === "player") continue;
    const rule = ruleForEnchant(e, state.chess.board[e.on.sq]?.type);
    if (rule) put(e.on.sq, rule);
  }

  // 성역: your pieces around your king cannot be taken by the opponent's cards.
  // Capture immunity is the part the move generator can enforce.
  for (const color of COLORS) {
    if (!state.players[color].lasting.some((l) => l.card === "sanctuary")) continue;
    for (const sq of sanctuarySquares(state, color)) {
      rules.protected = [...(rules.protected ?? []), sq];
    }
  }

  if (Object.keys(squareRules).length > 0) rules.squareRules = squareRules;
  return rules;
}

/** The squares 성역 covers: your own pieces in the 3×3 around your king. */
export function sanctuarySquares(state: MatchState, color: Color): Square[] {
  const { chess } = state;
  const board = chess.board;
  let king = -1;
  for (let sq = 0; sq < board.length; sq++) {
    const p = board[sq];
    if (p && p.color === color && p.type === "k") { king = sq; break; }
  }
  if (king < 0) return [];
  const out: Square[] = [];
  const f = king % chess.width;
  const r = Math.floor(king / chess.width);
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nr < 0 || nf >= chess.width || nr >= chess.height) continue;
      const sq = nr * chess.width + nf;
      const p = board[sq];
      if (p && p.color === color) out.push(sq);
    }
  }
  return out;
}

/** The phase a turn opens on, and the one that follows each step. */
export function nextPhase(state: MatchState, from: Phase): Phase {
  const cfg = modeRules(state.mode);
  if (from === "draw") return cfg.pieceCards ? "summon" : "skill";
  if (from === "summon") return "skill";
  return "move";
}

/**
 * Runs when `color`'s turn begins: bank cost, tick enchants down, clear last
 * turn's temporary state, fire the turn-start lasting cards, then open the draw
 * step — which is where a full hand becomes a decision, so this can leave a
 * `draw-choice` pending for the client to answer.
 */
export function beginTurn(
  state: MatchState,
  color: Color,
  events: MatchEvent[],
  rng: Rng,
): void {
  const cfg = modeRules(state.mode);
  const p = state.players[color];

  p.summonSick = []; // pieces summoned last turn are free to move now
  p.locked = []; // swamp / rewind locks last exactly one turn
  p.bonusCost = 0;
  p.doubleMove = null;
  p.freeMoves = 0;
  state.moveSpent = false;
  state.skillsPlayed = 0;

  tickEnchants(state, color, events);

  if (!usesCards(state.mode)) {
    state.phase = "move";
    return;
  }

  p.cost = Math.min(cfg.costCap, p.cost + cfg.costPerTurn);
  state.rules = deriveRules(state);
  state.phase = "draw";
  runDrawStep(state, color, events, rng);
}

/**
 * Enchants count down on their owner's own turns, which is how docs/skill.md
 * words every duration ("자신 턴 기준 N턴"). An expiring enchant may have to put
 * something back the way it was — a brainwashed pawn goes home.
 */
function tickEnchants(state: MatchState, color: Color, events: MatchEvent[]): void {
  const expired: Enchant[] = [];
  for (const e of state.enchants) {
    if (e.ticksOn !== color || e.turnsLeft === null) continue;
    e.turnsLeft -= 1;
    if (e.turnsLeft <= 0) expired.push(e);
  }
  for (const e of expired) endEnchant(state, e, events);

  // 환각 is the one lasting card on a clock; the rest run until destroyed.
  for (const c of COLORS) {
    const p = state.players[c];
    if (c !== color) continue;
    p.lasting = p.lasting.filter((l) => {
      if (l.turnsLeft === undefined || l.turnsLeft === null) return true;
      l.turnsLeft -= 1;
      if (l.turnsLeft > 0) return true;
      state.players[c].discard.push(l.card);
      events.push({ type: "destroyed", color: c, card: l.card });
      return false;
    });
  }
}

/** Take an enchant off and undo whatever it was holding in place. */
export function endEnchant(state: MatchState, e: Enchant, events: MatchEvent[]): void {
  state.enchants = state.enchants.filter((x) => x.id !== e.id);
  if (e.card === "brainwash" && e.on.kind !== "player") {
    // The pawn was only on loan: hand it back to the side that owned it.
    const piece = state.chess.board[e.on.sq];
    const from = e.data?.from;
    if (piece && (from === "w" || from === "b")) {
      state.chess.board[e.on.sq] = { color: from, type: piece.type };
    }
  }
  if (e.card === "double-image" && e.on.kind !== "player") {
    // The double was never a real piece; it simply stops existing.
    state.chess.board[e.on.sq] = null;
  }
  if (e.card === "awaken" && e.on.kind !== "player") {
    // The crown was borrowed: the piece goes back to what it was.
    const piece = state.chess.board[e.on.sq];
    const was = e.data?.was;
    if (piece && typeof was === "string") {
      state.chess.board[e.on.sq] = { color: piece.color, type: was as typeof piece.type };
    }
  }
  events.push({ type: "toast", text: `${e.card} ended` });
}

/**
 * The draw step. Under the cap it just draws and moves on; at the cap the
 * choice — decline the draw, or take it and pitch something — belongs to the
 * player, so it stops here and waits.
 */
export function runDrawStep(
  state: MatchState,
  color: Color,
  events: MatchEvent[],
  rng: Rng,
): void {
  const cfg = modeRules(state.mode);
  const p = state.players[color];
  if (p.hand.length >= cfg.handCap) {
    state.pending = { kind: "draw-choice", color };
    return;
  }
  const card = drawCard(p, rng);
  if (card) {
    p.hand.push(card);
    events.push({ type: "drew", color, card });
    onOpponentDrew(state, color, events, rng);
  }
  state.phase = nextPhase(state, "draw");
}

/**
 * 첩보: every card the opponent draws is a dice roll away from being seen. The
 * roll happens here rather than in the reducer so every draw path — the turn's
 * own draw, 명상, 헌납 — goes through the same check.
 */
export function onOpponentDrew(
  state: MatchState,
  drawer: Color,
  events: MatchEvent[],
  rng: Rng,
): void {
  const spy = opposite(drawer);
  if (!state.players[spy].lasting.some((l) => l.card === "espionage")) return;
  const roll = Math.floor(rng() * 6) + 1;
  events.push({ type: "dice", color: spy, value: roll });
  if (roll >= 4) {
    const index = state.players[drawer].hand.length - 1;
    if (index >= 0 && !state.players[spy].revealed.includes(index)) {
      state.players[spy].revealed.push(index);
    }
  }
}

/** Mark the match ended. */
export function endGame(
  state: MatchState,
  events: MatchEvent[],
  winner: Color | "draw",
  reason: string,
): void {
  state.status = "ended";
  state.winner = winner;
  state.endReason = reason;
  events.push({ type: "game-over", winner, reason });
}

/** Detect a natural chess ending (checkmate/stalemate/draw). */
export function checkGameOver(state: MatchState, events: MatchEvent[]): void {
  if (state.status === "ended") return;
  const s = getStatus(state.chess, state.rules);
  if (s === "checkmate") {
    endGame(state, events, opposite(state.chess.turn), "checkmate");
  } else if (s === "stalemate" || s.startsWith("draw")) {
    endGame(state, events, "draw", s);
  }
}
