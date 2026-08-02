import {
  applyMove,
  cloneState,
  fileOf,
  findKing,
  generateLegalMoves,
  getStatus,
  isInCheck,
  makeSquare,
  onBoard,
  opposite,
  rankOf,
  type Color,
  type Piece,
  type PieceType,
  type SkillRules,
  type Square,
} from "@skill/chess-core";
import { skillMeta } from "./skills.js";
import { cloneMatch, deriveRules, endGame, onTurnStart } from "./match.js";
import type {
  Action,
  MatchEvent,
  MatchState,
  Pending,
  ReduceResult,
  Rng,
  SkillCardState,
} from "./types.js";

const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// ── card helpers ────────────────────────────────────────────
function findCard(state: MatchState, color: Color, id: string): SkillCardState | undefined {
  return state.players[color].deck.find((c) => c.id === id);
}

function getReadyActive(state: MatchState, color: Color, id: string): SkillCardState | undefined {
  const meta = skillMeta(id);
  if (!meta || meta.type !== "active") return undefined;
  const card = findCard(state, color, id);
  if (!card || card.cooldownRemaining > 0) return undefined;
  if (card.usesLeft !== null && card.usesLeft <= 0) return undefined;
  return card;
}

function markUsed(card: SkillCardState): void {
  const meta = skillMeta(card.id);
  if (meta?.cooldown) card.cooldownRemaining = meta.cooldown;
  if (card.usesLeft !== null) card.usesLeft -= 1;
}

// ── turn / ending ───────────────────────────────────────────
function endTurn(state: MatchState, acting: Color, events: MatchEvent[]): void {
  const opp = opposite(acting);
  if (state.players[acting].extraTurnPending) {
    state.players[acting].extraTurnPending = false;
    state.chess = { ...state.chess, turn: acting, enPassant: null };
    events.push({ type: "toast", text: "One More!" });
  } else {
    state.chess = { ...state.chess, turn: opp };
    onTurnStart(state, opp, events);
  }
  state.rules = deriveRules(state);
  resolveEnding(state, events);
}

/** Natural endings + death-intercept skills (Loyal Vassal / King's Return). */
function resolveEnding(state: MatchState, events: MatchEvent[]): void {
  if (state.status === "ended" || state.pending) return;

  if (state.titan) {
    // The titan owner has no king, so only the opponent can be chess-mated.
    if (state.chess.turn === state.titan.owner) return; // owner will move the titan
    const st = getStatus(state.chess, state.rules);
    if (st === "checkmate") return endGame(state, events, state.titan.owner, "checkmate");
    if (isDraw(st)) return endGame(state, events, "draw", st);
    return;
  }

  const st = getStatus(state.chess, state.rules);
  if (st === "checkmate") {
    const mated = state.chess.turn;
    if (tryLoyalVassal(state, mated, events)) return;
    if (startKingsReturn(state, mated, events)) return;
    endGame(state, events, opposite(mated), "checkmate");
  } else if (isDraw(st)) {
    endGame(state, events, "draw", st);
  }
}

function isDraw(status: string): boolean {
  return status === "stalemate" || status.startsWith("draw");
}

/** Loyal Vassal: swap the mated king with a surviving pawn onto a safe square. */
function tryLoyalVassal(state: MatchState, mated: Color, events: MatchEvent[]): boolean {
  const card = findCard(state, mated, "loyal-vassal");
  if (!card || (card.usesLeft !== null && card.usesLeft <= 0)) return false;
  const board = state.chess.board;
  const king = findKing(board, mated);
  if (king < 0) return false;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || p.color !== mated || p.type !== "p") continue;
    const nb = board.slice();
    nb[king] = null;
    nb[sq] = { color: mated, type: "k" };
    const trial = { ...state.chess, board: nb, turn: mated };
    if (isInCheck(trial, mated, state.rules)) continue;
    // Survived: the pawn died, the turn passes back to the opponent.
    state.chess = { ...trial, turn: opposite(mated) };
    markUsed(card);
    state.rules = deriveRules(state);
    onTurnStart(state, opposite(mated), events);
    events.push({ type: "toast", text: "Loyal Vassal — a pawn dies in your place!" });
    return true;
  }
  return false;
}

/** King's Return: remove the king and await a revival placement from the mated side. */
function startKingsReturn(state: MatchState, mated: Color, events: MatchEvent[]): boolean {
  const card = findCard(state, mated, "kings-return");
  if (!card || (card.usesLeft !== null && card.usesLeft <= 0)) return false;
  const king = findKing(state.chess.board, mated);
  if (king < 0) return false;
  const nb = state.chess.board.slice();
  nb[king] = null;
  state.chess = { ...state.chess, board: nb };
  state.pending = { kind: "kings-return", color: mated };
  events.push({ type: "toast", text: "King's Return: pick a revival square" });
  return true;
}

// ── piece-tracking helpers ──────────────────────────────────
function followEffects(state: MatchState, acting: Color, from: Square, to: Square): void {
  const p = state.players[acting];
  if (p.protectedSquare === from) p.protectedSquare = to;
  const idx = p.tempQueens.indexOf(from);
  if (idx >= 0) p.tempQueens[idx] = to;
}

function buryCapture(state: MatchState, acting: Color, capturedColor: Color, type: PieceType, at: Square): void {
  state.players[capturedColor].grave.push(type);
  const tq = state.players[capturedColor].tempQueens;
  const i = tq.indexOf(at);
  if (i >= 0) tq.splice(i, 1);
}

function mostValuableDead(grave: PieceType[]): PieceType | null {
  if (grave.length === 0) return null;
  return grave.reduce((a, b) => (PIECE_VALUE[b] > PIECE_VALUE[a] ? b : a));
}

// ── reposition skills (Retreat / Cross & Diagonal / Raid March) ──────
function repositionDests(board: (Piece | null)[], id: string, from: Square): Square[] {
  const piece = board[from]!;
  const f = fileOf(from);
  const r = rankOf(from);
  const dir = piece.color === "w" ? 1 : -1;
  const out: Square[] = [];
  const add = (nf: number, nr: number, allowCapture: boolean) => {
    if (!onBoard(nf, nr)) return;
    const to = makeSquare(nf, nr);
    const t = board[to];
    if (!t) out.push(to);
    else if (allowCapture && t.color !== piece.color) out.push(to);
  };
  if (id === "retreat") {
    add(f, r - dir, false);
    add(f - 1, r, false);
    add(f + 1, r, false);
  } else if (id === "cross-diagonal") {
    const dirs: [number, number][] =
      piece.type === "b"
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : [[1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [df, dr] of dirs) add(f + df, r + dr, true);
  } else if (id === "raid-march") {
    const around: [number, number][] = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [df, dr] of around) add(f + df, r + dr, false);
  }
  return out;
}

function repositionSource(id: string, type: PieceType): boolean {
  if (id === "retreat") return type === "p";
  if (id === "cross-diagonal") return type === "b" || type === "r";
  if (id === "raid-march") return true;
  return false;
}

// ── titan ───────────────────────────────────────────────────
const NEIGHBORS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];
const TITAN_DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function titanReach(state: MatchState): { anchor: Square; cells: Square[] }[] {
  const titan = state.titan!;
  const owner = titan.owner;
  const board = state.chess.board;
  const res: { anchor: Square; cells: Square[] }[] = [];
  for (const [df, dr] of TITAN_DIRS) {
    for (let d = 1; d <= 4; d++) {
      const ok = titan.cells.every((sq) => onBoard(fileOf(sq) + df * d, rankOf(sq) + dr * d));
      if (!ok) break;
      const cells = titan.cells.map((sq) => makeSquare(fileOf(sq) + df * d, rankOf(sq) + dr * d));
      if (cells.some((sq) => board[sq]?.color === owner)) continue;
      res.push({ anchor: cells[0]!, cells });
    }
  }
  return res;
}

// ── main reducer ────────────────────────────────────────────
function fail(error: string): ReduceResult {
  return { ok: false, error };
}

export function reduce(prev: MatchState, action: Action, rng: Rng = Math.random): ReduceResult {
  if (prev.status === "ended") return fail("match already ended");

  const s = cloneMatch(prev);
  const events: MatchEvent[] = [];

  if (s.pending) return reducePending(s, action, events);

  const acting: Color = s.chess.turn;
  const board = s.chess.board;

  switch (action.type) {
    case "resign":
      endGame(s, events, opposite(acting), "resign");
      break;

    case "move":
    case "phantom-move": {
      const phantom = action.type === "phantom-move";
      if (action.from === s.players[acting].lockedFrom) return fail("piece is locked this turn");

      // Titan: an enemy move onto a titan cell is an attack, not a move.
      if (s.titan && s.titan.cells.includes(action.to)) {
        if (acting === s.titan.owner) return fail("cannot move onto your titan");
        return titanHit(s, action.from, action.to, events);
      }

      let card: SkillCardState | undefined;
      let rules: SkillRules = s.rules;
      if (phantom) {
        card = getReadyActive(s, acting, "phantom");
        if (!card) return fail("phantom not ready");
        rules = { ...s.rules, phantom: { ...s.rules.phantom, [acting]: true } };
      }
      const promotion = action.type === "move" ? action.promotion ?? "q" : "q";
      const legal = generateLegalMoves(s.chess, action.from, rules).filter((m) => m.to === action.to);
      const chosen = legal.find((m) => !m.promotion || m.promotion === promotion);
      if (!chosen) return fail("illegal move");

      const captured = chosen.captured ?? null;
      s.undo = {
        mover: acting,
        chess: cloneState(s.chess),
        captured: captured && captured.color !== acting ? captured.type : null,
        from: chosen.from,
      };
      s.chess = applyMove(s.chess, chosen);
      if (captured && captured.color !== acting) {
        buryCapture(s, acting, captured.color, captured.type, chosen.to);
      }
      followEffects(s, acting, chosen.from, chosen.to);
      s.players[acting].lockedFrom = null;
      if (card) markUsed(card);
      endTurn(s, acting, events);
      break;
    }

    case "teleport": {
      const card = getReadyActive(s, acting, "teleport");
      if (!card) return fail("teleport not ready");
      const pa = board[action.a];
      const pb = board[action.b];
      if (!pa || pa.color !== acting || pa.type === "k") return fail("invalid piece a");
      if (!pb || pb.color !== acting || pb.type === "k") return fail("invalid piece b");
      const nb = board.slice();
      const t = nb[action.a] ?? null;
      nb[action.a] = nb[action.b] ?? null;
      nb[action.b] = t;
      s.chess = { ...s.chess, board: nb, enPassant: null };
      if (isInCheck(s.chess, acting, s.rules)) return fail("would expose the king");
      markUsed(card);
      events.push({ type: "toast", text: "Teleport!" });
      endTurn(s, acting, events);
      break;
    }

    case "retreat":
    case "cross-diagonal":
    case "raid-march": {
      const card = getReadyActive(s, acting, action.type);
      if (!card) return fail(`${action.type} not ready`);
      const piece = board[action.from];
      if (!piece || piece.color !== acting || !repositionSource(action.type, piece.type)) {
        return fail("invalid source piece");
      }
      if (!repositionDests(board, action.type, action.from).includes(action.to)) {
        return fail("illegal destination");
      }
      const captured = board[action.to] ?? null;
      const nb = board.slice();
      nb[action.to] = piece;
      nb[action.from] = null;
      s.chess = { ...s.chess, board: nb, enPassant: null };
      if (isInCheck(s.chess, acting, s.rules)) return fail("would expose the king");
      if (captured && captured.color !== acting) {
        buryCapture(s, acting, captured.color, captured.type, action.to);
      }
      followEffects(s, acting, action.from, action.to);
      markUsed(card);
      events.push({ type: "toast", text: "Skill move!" });
      const meta = skillMeta(action.type);
      if (meta?.consumesTurn) endTurn(s, acting, events);
      else s.rules = deriveRules(s); // Raid March: keeps the turn
      break;
    }

    case "iron-guard": {
      const card = getReadyActive(s, acting, "iron-guard");
      if (!card) return fail("iron-guard not ready");
      const p = board[action.sq];
      if (!p || p.color !== acting || p.type === "k") return fail("invalid piece");
      s.players[acting].protectedSquare = action.sq;
      markUsed(card);
      s.rules = deriveRules(s);
      events.push({ type: "toast", text: "Iron Guard!" });
      break;
    }

    case "one-more": {
      const card = getReadyActive(s, acting, "one-more");
      if (!card) return fail("one-more not ready");
      s.players[acting].extraTurnPending = true;
      markUsed(card);
      events.push({ type: "toast", text: "One More armed" });
      break;
    }

    case "cloak": {
      const card = getReadyActive(s, acting, "cloak");
      if (!card) return fail("cloak not ready");
      s.players[acting].cloakTurnsLeft = 5;
      markUsed(card);
      events.push({ type: "toast", text: "Cloak!" });
      endTurn(s, acting, events);
      break;
    }

    case "foresight": {
      const card = getReadyActive(s, acting, "foresight");
      if (!card) return fail("foresight not ready");
      const opp = opposite(acting);
      if (action.index < 0 || action.index >= s.players[opp].deck.length) return fail("bad card index");
      if (!s.players[acting].revealed.includes(action.index)) s.players[acting].revealed.push(action.index);
      markUsed(card);
      events.push({ type: "toast", text: "Foresight" });
      break;
    }

    case "evolve": {
      const card = getReadyActive(s, acting, "evolve-gamble");
      if (!card) return fail("evolve not ready");
      const p = board[action.sq];
      if (!p || p.color !== acting || p.type === "k" || p.type === "q") return fail("invalid piece");
      markUsed(card);
      let success: boolean;
      if (p.type === "p") {
        success = rng() < 0.25;
        if (success) {
          const t = (["b", "n", "r"] as PieceType[])[Math.floor(rng() * 3)]!;
          board[action.sq] = { color: acting, type: t };
        }
      } else {
        success = rng() < 0.1;
        if (success) board[action.sq] = { color: acting, type: "q" };
      }
      if (!success) {
        s.players[acting].grave.push(p.type);
        board[action.sq] = null;
      }
      events.push({ type: "gamble", success });
      events.push({ type: "toast", text: success ? "Evolve succeeded!" : "Evolve failed — it explodes" });
      endTurn(s, acting, events);
      break;
    }

    case "revive": {
      const card = getReadyActive(s, acting, "revive-gamble");
      if (!card) return fail("revive not ready");
      const fuel = board[action.fuel];
      if (!fuel || fuel.color !== acting || fuel.type === "k" || fuel.type === "q") return fail("invalid fuel");
      const reviveType = mostValuableDead(s.players[acting].grave);
      if (!reviveType) return fail("no dead pieces to revive");
      markUsed(card);
      const chance = reviveType === "p" ? 0.5 : reviveType === "q" ? 0.15 : 0.3;
      const success = rng() < chance;
      if (success) {
        const i = s.players[acting].grave.indexOf(reviveType);
        if (i >= 0) s.players[acting].grave.splice(i, 1);
        s.pending = { kind: "revive-place", color: acting, piece: reviveType };
        events.push({ type: "gamble", success: true });
        events.push({ type: "toast", text: "Revive succeeded! Pick a square" });
      } else {
        s.players[acting].grave.push(fuel.type);
        board[action.fuel] = null;
        events.push({ type: "gamble", success: false });
        events.push({ type: "toast", text: "Revive failed — it explodes" });
      }
      break; // Revive does not consume the turn
    }

    case "sacrifice-start": {
      const card = getReadyActive(s, acting, "sacrifice-pact");
      if (!card) return fail("sacrifice not ready");
      const p = board[action.sq];
      if (!p || p.color !== acting || p.type === "k") return fail("invalid piece");
      const nb = board.slice();
      nb[action.sq] = null;
      const trial = { ...s.chess, board: nb, turn: acting };
      if (isInCheck(trial, acting, s.rules)) return fail("would expose the king");
      s.chess = trial;
      s.players[acting].grave.push(p.type);
      markUsed(card);
      s.pending = { kind: "sacrifice", color: acting, movesLeft: 3, moved: [] };
      events.push({ type: "toast", text: "Sacrificed — move 3 pieces (no captures)" });
      break;
    }

    case "liberation": {
      const card = getReadyActive(s, acting, "liberation");
      if (!card) return fail("liberation not ready");
      const nb = board.slice();
      const temp: Square[] = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = nb[sq];
        if (p && p.color === acting && (p.type === "r" || p.type === "b" || p.type === "n")) {
          nb[sq] = { color: acting, type: "q" };
          temp.push(sq);
        }
      }
      s.chess = { ...s.chess, board: nb, enPassant: null };
      s.players[acting].tempQueens = temp;
      s.players[acting].tempQueensTurnsLeft = 5;
      markUsed(card);
      events.push({ type: "toast", text: "Liberation! (reverts to pawns in 5 turns)" });
      endTurn(s, acting, events);
      break;
    }

    case "undo": {
      const card = getReadyActive(s, acting, "undo");
      if (!card) return fail("undo not ready");
      if (!s.undo || s.undo.mover !== opposite(acting)) return fail("nothing to undo");
      const opp = opposite(acting);
      s.chess = cloneState(s.undo.chess); // restore pre-move position (turn = opp)
      if (s.undo.captured) {
        const g = s.players[acting].grave; // our piece was revived by the undo
        const i = g.indexOf(s.undo.captured);
        if (i >= 0) g.splice(i, 1);
      }
      s.players[opp].lockedFrom = s.undo.from; // that piece can't move again this turn
      s.undo = null;
      markUsed(card);
      s.rules = deriveRules(s);
      events.push({ type: "toast", text: "Undo!" });
      // Turn is the opponent's again; no fresh turn-start (they resume).
      break;
    }

    case "titan-fuse":
      return titanFuse(s, acting, events);

    case "titan-move": {
      if (!s.titan || s.titan.owner !== acting) return fail("no titan to move");
      const reach = titanReach(s);
      const dest = reach.find((r) => sameCells(r.cells, action.cells));
      if (!dest) return fail("illegal titan move");
      return titanMove(s, dest.cells, events);
    }

    case "sacrifice-move":
    case "sacrifice-end":
    case "revive-place":
    case "kings-return-place":
      return fail(`${action.type} is only valid during that skill`);

    default: {
      const _e: never = action;
      return fail(`unhandled action: ${JSON.stringify(_e)}`);
    }
  }

  return { ok: true, state: s, events };
}

// ── pending (multi-step) dispatch ───────────────────────────
function reducePending(s: MatchState, action: Action, events: MatchEvent[]): ReduceResult {
  const p = s.pending as Pending;
  const color = p.color;
  const board = s.chess.board;

  if (p.kind === "sacrifice") {
    if (action.type === "sacrifice-move") {
      if (p.moved.includes(action.from)) return fail("piece already moved");
      const legal = generateLegalMoves(s.chess, action.from, s.rules).filter(
        (m) => m.to === action.to && !m.captured,
      );
      const mv = legal[0];
      if (!mv || board[action.from]?.color !== color) return fail("illegal sacrifice move");
      s.chess = { ...applyMove(s.chess, mv), turn: color }; // keep the caster's turn
      followEffects(s, color, action.from, action.to);
      const moved = [...p.moved, action.to];
      const movesLeft = p.movesLeft - 1;
      if (movesLeft <= 0) {
        s.pending = null;
        endTurn(s, color, events);
      } else {
        s.pending = { kind: "sacrifice", color, movesLeft, moved };
      }
      return { ok: true, state: s, events };
    }
    if (action.type === "sacrifice-end") {
      s.pending = null;
      endTurn(s, color, events);
      return { ok: true, state: s, events };
    }
    return fail("expected sacrifice-move / sacrifice-end");
  }

  if (p.kind === "revive-place") {
    if (action.type === "revive-place") {
      if (board[action.sq]) return fail("square not empty");
      board[action.sq] = { color, type: p.piece };
      s.players[color].lockedFrom = action.sq; // can't move it this turn
      s.pending = null;
      events.push({ type: "toast", text: "Revived piece placed" });
      return { ok: true, state: s, events }; // does not consume the turn
    }
    return fail("expected revive-place");
  }

  if (p.kind === "kings-return") {
    if (action.type === "kings-return-place") {
      if (board[action.sq]) return fail("square not empty");
      board[action.sq] = { color, type: "k" };
      const f = fileOf(action.sq);
      const r = rankOf(action.sq);
      for (const df of [-1, 1]) {
        if (onBoard(f + df, r)) {
          const s2 = makeSquare(f + df, r);
          if (!board[s2]) board[s2] = { color, type: "p" };
        }
      }
      const card = findCard(s, color, "kings-return");
      if (card) markUsed(card);
      s.pending = null;
      events.push({ type: "toast", text: "King's Return!" });
      // Revival turn is skipped: pass to the opponent.
      s.chess = { ...s.chess, turn: opposite(color) };
      onTurnStart(s, opposite(color), events);
      s.rules = deriveRules(s);
      resolveEnding(s, events);
      return { ok: true, state: s, events };
    }
    return fail("expected kings-return-place");
  }

  return fail("unknown pending step");
}

// ── titan effects ───────────────────────────────────────────
function titanFuse(s: MatchState, acting: Color, events: MatchEvent[]): ReduceResult {
  const card = getReadyActive(s, acting, "titan-fusion");
  if (!card) return fail("titan not ready");
  const board = s.chess.board;
  const king = findKing(board, acting);
  if (king < 0) return fail("no king");
  const f = fileOf(king);
  const r = rankOf(king);
  const dir = acting === "w" ? 1 : -1;
  if (!onBoard(f, r + dir) || !onBoard(f - 1, r) || !onBoard(f + 1, r)) return fail("no room to fuse");
  const frontSq = makeSquare(f, r + dir);
  const leftSq = makeSquare(f - 1, r);
  const rightSq = makeSquare(f + 1, r);
  const front = board[frontSq];
  const left = board[leftSq];
  const right = board[rightSq];
  if (!(front && front.color === acting && front.type === "q")) return fail("need a queen in front");
  if (!(left?.color === acting && left.type === "r" && right?.color === acting && right.type === "r")) {
    return fail("need rooks on both sides");
  }
  const cells4 = [king, frontSq, leftSq, rightSq];
  const nb = board.slice();
  for (const [df, dr] of NEIGHBORS) {
    if (!onBoard(f + df, r + dr)) continue;
    const sq = makeSquare(f + df, r + dr);
    if (cells4.includes(sq)) continue;
    const p = nb[sq];
    if (p && p.color === acting) return fail("king's ring must be clear of other allies");
    if (p && p.color !== acting) nb[sq] = null; // enemies in range die
  }
  for (const sq of cells4) nb[sq] = null;
  s.chess = { ...s.chess, board: nb, enPassant: null };
  s.titan = { owner: acting, cells: cells4, hp: 3 };
  markUsed(card);
  events.push({ type: "toast", text: "Fusion — the Titan rises!" });
  if (findKing(s.chess.board, opposite(acting)) < 0) {
    endGame(s, events, acting, "titan-crush");
    return { ok: true, state: s, events };
  }
  endTurn(s, acting, events);
  return { ok: true, state: s, events };
}

function titanMove(s: MatchState, destCells: Square[], events: MatchEvent[]): ReduceResult {
  const titan = s.titan!;
  const owner = titan.owner;
  const nb = s.chess.board.slice();
  let killedKing = false;
  for (const sq of destCells) {
    const p = nb[sq];
    if (p && p.color !== owner) {
      if (p.type === "k") killedKing = true;
      nb[sq] = null;
    }
  }
  s.chess = { ...s.chess, board: nb, enPassant: null };
  s.titan = { owner, cells: destCells, hp: titan.hp };
  events.push({ type: "toast", text: "The Titan advances!" });
  if (killedKing || findKing(s.chess.board, opposite(owner)) < 0) {
    endGame(s, events, owner, "titan-crush");
    return { ok: true, state: s, events };
  }
  endTurn(s, owner, events);
  return { ok: true, state: s, events };
}

function titanHit(s: MatchState, from: Square, to: Square, events: MatchEvent[]): ReduceResult {
  const titan = s.titan!;
  const acting = opposite(titan.owner);
  const nb = s.chess.board.slice();
  const attacker = nb[from];
  nb[from] = null;
  const backF = fileOf(from) + Math.sign(fileOf(from) - fileOf(to));
  const backR = rankOf(from) + Math.sign(rankOf(from) - rankOf(to));
  if (onBoard(backF, backR)) nb[makeSquare(backF, backR)] = attacker ?? null;
  s.chess = { ...s.chess, board: nb, turn: titan.owner };
  s.titan = { ...titan, hp: titan.hp - 1 };
  onTurnStart(s, titan.owner, events);
  if (s.titan.hp <= 0) {
    s.titan = null;
    endGame(s, events, acting, "titan-explode");
  } else {
    events.push({ type: "toast", text: `Titan hit! (HP ${s.titan.hp})` });
  }
  s.rules = deriveRules(s);
  return { ok: true, state: s, events };
}

function sameCells(a: Square[], b: Square[]): boolean {
  if (a.length !== b.length) return false;
  const sb = [...b].sort((x, y) => x - y);
  return [...a].sort((x, y) => x - y).every((v, i) => v === sb[i]);
}
