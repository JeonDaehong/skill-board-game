import {
  cloneState,
  fileOf,
  findKing,
  makeSquare,
  onBoard,
  opposite,
  rankOf,
} from "./board.js";
import type {
  Color,
  GameState,
  Move,
  MoveFlag,
  Piece,
  PieceType,
  SkillRules,
  Square,
} from "./types.js";

const KNIGHT_DELTAS: ReadonlyArray<[number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const KING_DELTAS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const BISHOP_DIRS: ReadonlyArray<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const ROOK_DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 철벽 방어: a piece on a protected square cannot be captured. */
function isProtected(rules: SkillRules | undefined, sq: Square): boolean {
  return rules?.protected?.includes(sq) ?? false;
}

/** 민첩한 나이트 extra jumps, per color (net (±2, +3) toward the enemy). */
function agileKnightDeltas(color: Color): ReadonlyArray<[number, number]> {
  return color === "w"
    ? [
        [2, 3],
        [-2, 3],
      ]
    : [
        [2, -3],
        [-2, -3],
      ];
}

/** Is `sq` attacked by any piece of `byColor`? Used for check detection. */
export function isSquareAttacked(
  board: (Piece | null)[],
  sq: Square,
  byColor: Color,
  rules?: SkillRules,
): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);

  // Pawn attacks: a byColor pawn attacks diagonally "forward".
  // White pawns move toward higher ranks, so a white pawn attacking `sq`
  // sits one rank below it.
  const pawnRank = byColor === "w" ? r - 1 : r + 1;
  for (const df of [-1, 1]) {
    if (onBoard(f + df, pawnRank)) {
      const p = board[makeSquare(f + df, pawnRank)];
      if (p && p.color === byColor && p.type === "p") return true;
    }
  }

  // 농민 봉기: byColor pawns also threaten the square straight ahead of them,
  // so a pawn one rank "behind" `sq` (toward its own side) attacks it.
  if (rules?.peasantRevolt?.[byColor] && onBoard(f, pawnRank)) {
    const p = board[makeSquare(f, pawnRank)];
    if (p && p.color === byColor && p.type === "p") return true;
  }

  // Knight attacks.
  for (const [df, dr] of KNIGHT_DELTAS) {
    if (onBoard(f + df, r + dr)) {
      const p = board[makeSquare(f + df, r + dr)];
      if (p && p.color === byColor && p.type === "n") return true;
    }
  }

  // 민첩한 나이트: byColor knights also threaten via the elephant jump. A knight
  // attacking `sq` sits at `sq - delta`.
  if (rules?.agileKnight?.[byColor]) {
    for (const [df, dr] of agileKnightDeltas(byColor)) {
      if (onBoard(f - df, r - dr)) {
        const p = board[makeSquare(f - df, r - dr)];
        if (p && p.color === byColor && p.type === "n") return true;
      }
    }
  }

  // King attacks (adjacent).
  for (const [df, dr] of KING_DELTAS) {
    if (onBoard(f + df, r + dr)) {
      const p = board[makeSquare(f + df, r + dr)];
      if (p && p.color === byColor && p.type === "k") return true;
    }
  }

  // Sliding attacks: bishop/queen on diagonals, rook/queen on files/ranks.
  // 혼란 swaps which slider type covers which rays (queen always covers both).
  const diagSlider = rules?.chaos ? "r" : "b";
  const orthoSlider = rules?.chaos ? "b" : "r";
  for (const [df, dr] of BISHOP_DIRS) {
    if (slideHits(board, f, r, df, dr, byColor, diagSlider)) return true;
  }
  for (const [df, dr] of ROOK_DIRS) {
    if (slideHits(board, f, r, df, dr, byColor, orthoSlider)) return true;
  }

  return false;
}

/** Walk a ray; return true if the first piece is `byColor` of `slider` type or a queen. */
function slideHits(
  board: (Piece | null)[],
  f: number,
  r: number,
  df: number,
  dr: number,
  byColor: Color,
  slider: "b" | "r",
): boolean {
  let nf = f + df;
  let nr = r + dr;
  while (onBoard(nf, nr)) {
    const p = board[makeSquare(nf, nr)];
    if (p) {
      if (p.color === byColor && (p.type === slider || p.type === "q")) return true;
      return false;
    }
    nf += df;
    nr += dr;
  }
  return false;
}

/** Is the given color's king currently in check? */
export function isInCheck(state: GameState, color: Color, rules?: SkillRules): boolean {
  const king = findKing(state.board, color);
  if (king < 0) return false;
  return isSquareAttacked(state.board, king, opposite(color), rules);
}

/**
 * Generate all fully legal moves for the side to move. If `onlyFrom` is given,
 * restrict to moves originating from that square (handy for UI highlighting).
 */
export function generateLegalMoves(
  state: GameState,
  onlyFrom?: Square,
  rules?: SkillRules,
): Move[] {
  const pseudo = generatePseudoLegalMoves(state, onlyFrom, rules);
  const legal: Move[] = [];
  for (const move of pseudo) {
    const next = applyMove(state, move);
    // A move is legal only if it does not leave the mover's own king in check.
    if (!isInCheck({ ...next, turn: state.turn }, state.turn, rules)) {
      legal.push(move);
    }
  }
  return legal;
}

/** Pseudo-legal moves ignore whether the mover's king is left in check. */
export function generatePseudoLegalMoves(
  state: GameState,
  onlyFrom?: Square,
  rules?: SkillRules,
): Move[] {
  const moves: Move[] = [];
  const { board, turn } = state;

  for (let sq = 0; sq < 64; sq++) {
    if (onlyFrom !== undefined && sq !== onlyFrom) continue;
    const piece = board[sq];
    if (!piece || piece.color !== turn) continue;

    const phantom = !!rules?.phantom?.[piece.color];
    switch (piece.type) {
      case "p":
        genPawn(state, sq, piece, moves, rules);
        break;
      case "n":
        genStep(state, sq, piece, KNIGHT_DELTAS, moves, rules);
        if (rules?.agileKnight?.[piece.color]) {
          genStep(state, sq, piece, agileKnightDeltas(piece.color), moves, rules);
        }
        break;
      case "k":
        genStep(state, sq, piece, KING_DELTAS, moves, rules);
        genCastling(state, sq, piece, moves, rules);
        break;
      case "b":
        genSlide(state, sq, piece, rules?.chaos ? ROOK_DIRS : BISHOP_DIRS, moves, phantom, rules);
        break;
      case "r":
        genSlide(state, sq, piece, rules?.chaos ? BISHOP_DIRS : ROOK_DIRS, moves, phantom, rules);
        break;
      case "q":
        genSlide(state, sq, piece, [...BISHOP_DIRS, ...ROOK_DIRS], moves, phantom, rules);
        break;
    }
  }
  return moves;
}

function genStep(
  state: GameState,
  from: Square,
  piece: Piece,
  deltas: ReadonlyArray<[number, number]>,
  out: Move[],
  rules?: SkillRules,
): void {
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of deltas) {
    const nf = f + df;
    const nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const to = makeSquare(nf, nr);
    const target = state.board[to];
    if (!target) {
      out.push({ from, to, piece, flags: ["normal"] });
    } else if (target.color !== piece.color && !isProtected(rules, to)) {
      out.push({ from, to, piece, captured: target, flags: ["capture"] });
    }
  }
}

function genSlide(
  state: GameState,
  from: Square,
  piece: Piece,
  dirs: ReadonlyArray<[number, number]>,
  out: Move[],
  jumpFriendly = false,
  rules?: SkillRules,
): void {
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of dirs) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      const to = makeSquare(nf, nr);
      const target = state.board[to];
      if (!target) {
        out.push({ from, to, piece, flags: ["normal"] });
      } else if (target.color !== piece.color) {
        // Protected enemies block the ray but cannot be captured.
        if (!isProtected(rules, to)) {
          out.push({ from, to, piece, captured: target, flags: ["capture"] });
        }
        break; // enemies always block
      } else if (jumpFriendly) {
        // 유령 기물: pass over the friendly piece and keep going.
      } else {
        break; // friendly piece blocks
      }
      nf += df;
      nr += dr;
    }
  }
}

function genPawn(
  state: GameState,
  from: Square,
  piece: Piece,
  out: Move[],
  rules?: SkillRules,
): void {
  const dir = piece.color === "w" ? 1 : -1;
  const startRank = piece.color === "w" ? 1 : 6;
  const promoRank = piece.color === "w" ? 7 : 0;
  const f = fileOf(from);
  const r = rankOf(from);
  const oneRank = r + dir;

  // Single push.
  if (onBoard(f, oneRank) && !state.board[makeSquare(f, oneRank)]) {
    const to = makeSquare(f, oneRank);
    pushPawnMove(from, to, piece, undefined, oneRank === promoRank, out);

    // Double push from the starting rank.
    if (r === startRank) {
      const twoRank = r + 2 * dir;
      if (!state.board[makeSquare(f, twoRank)]) {
        out.push({
          from,
          to: makeSquare(f, twoRank),
          piece,
          flags: ["double-pawn"],
        });
      }
    }
  } else if (
    // 농민 봉기: capture an enemy piece directly ahead (blocked square).
    rules?.peasantRevolt?.[piece.color] &&
    onBoard(f, oneRank)
  ) {
    const to = makeSquare(f, oneRank);
    const target = state.board[to];
    if (target && target.color !== piece.color && !isProtected(rules, to)) {
      pushPawnMove(from, to, piece, target, oneRank === promoRank, out);
    }
  }

  // Captures (including en passant).
  for (const df of [-1, 1]) {
    const nf = f + df;
    const nr = r + dir;
    if (!onBoard(nf, nr)) continue;
    const to = makeSquare(nf, nr);
    const target = state.board[to];
    if (target && target.color !== piece.color && !isProtected(rules, to)) {
      pushPawnMove(from, to, piece, target, nr === promoRank, out);
    } else if (!target && to === state.enPassant) {
      // En passant: the captured pawn sits beside `from`, not on `to`.
      const capturedSq = makeSquare(nf, r);
      if (!isProtected(rules, capturedSq)) {
        const captured = state.board[capturedSq] ?? undefined;
        out.push({
          from,
          to,
          piece,
          captured,
          flags: ["en-passant", "capture"],
        });
      }
    }
  }
}

function pushPawnMove(
  from: Square,
  to: Square,
  piece: Piece,
  captured: Piece | undefined,
  isPromotion: boolean,
  out: Move[],
): void {
  const baseFlags: MoveFlag[] = captured ? ["capture"] : ["normal"];
  if (isPromotion) {
    for (const promo of ["q", "r", "b", "n"] as PieceType[]) {
      out.push({ from, to, piece, captured, promotion: promo, flags: [...baseFlags, "promotion"] });
    }
  } else {
    out.push({ from, to, piece, captured, flags: baseFlags });
  }
}

function genCastling(
  state: GameState,
  from: Square,
  piece: Piece,
  out: Move[],
  rules?: SkillRules,
): void {
  const color = piece.color;
  const rank = color === "w" ? 0 : 7;
  // King must be on its home square and not currently in check.
  if (from !== makeSquare(4, rank)) return;
  const enemy = opposite(color);
  if (isSquareAttacked(state.board, from, enemy, rules)) return;

  const rights = state.castling;
  const kingSide = color === "w" ? rights.wK : rights.bK;
  const queenSide = color === "w" ? rights.wQ : rights.bQ;

  if (kingSide) {
    const f5 = makeSquare(5, rank);
    const f6 = makeSquare(6, rank);
    if (
      !state.board[f5] &&
      !state.board[f6] &&
      !isSquareAttacked(state.board, f5, enemy, rules) &&
      !isSquareAttacked(state.board, f6, enemy, rules)
    ) {
      out.push({ from, to: f6, piece, flags: ["castle-king"] });
    }
  }
  if (queenSide) {
    const f1 = makeSquare(1, rank);
    const f2 = makeSquare(2, rank);
    const f3 = makeSquare(3, rank);
    if (
      !state.board[f1] &&
      !state.board[f2] &&
      !state.board[f3] &&
      !isSquareAttacked(state.board, f2, enemy, rules) &&
      !isSquareAttacked(state.board, f3, enemy, rules)
    ) {
      out.push({ from, to: f2, piece, flags: ["castle-queen"] });
    }
  }
}

/**
 * Apply a move and return the resulting state. Does not validate legality;
 * pass moves from generateLegalMoves for guaranteed-legal results.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const next = cloneState(state);
  const { board } = next;
  const color = move.piece.color;
  const rank = color === "w" ? 0 : 7;

  board[move.from] = null;

  // Place the piece (promotion swaps its type).
  const moved: Piece = move.promotion
    ? { color, type: move.promotion }
    : move.piece;
  board[move.to] = moved;

  // En passant removes the pawn beside the destination.
  if (move.flags.includes("en-passant")) {
    const capturedSq = makeSquare(fileOf(move.to), rankOf(move.from));
    board[capturedSq] = null;
  }

  // Castling also moves the rook.
  if (move.flags.includes("castle-king")) {
    board[makeSquare(5, rank)] = board[makeSquare(7, rank)] ?? null;
    board[makeSquare(7, rank)] = null;
  } else if (move.flags.includes("castle-queen")) {
    board[makeSquare(3, rank)] = board[makeSquare(0, rank)] ?? null;
    board[makeSquare(0, rank)] = null;
  }

  updateCastlingRights(next, move);

  // En passant target: only set right after a double pawn push.
  next.enPassant = move.flags.includes("double-pawn")
    ? makeSquare(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2)
    : null;

  // Halfmove clock resets on captures and pawn moves.
  next.halfmoveClock =
    move.captured || move.piece.type === "p" ? 0 : state.halfmoveClock + 1;

  if (color === "b") next.fullmoveNumber = state.fullmoveNumber + 1;
  next.turn = opposite(color);

  return next;
}

function updateCastlingRights(state: GameState, move: Move): void {
  const c = state.castling;
  const p = move.piece;

  // Moving the king forfeits both its castling rights.
  if (p.type === "k") {
    if (p.color === "w") {
      c.wK = false;
      c.wQ = false;
    } else {
      c.bK = false;
      c.bQ = false;
    }
  }

  // Moving or capturing a rook forfeits that side's right.
  const a1 = makeSquare(0, 0);
  const h1 = makeSquare(7, 0);
  const a8 = makeSquare(0, 7);
  const h8 = makeSquare(7, 7);
  for (const sq of [move.from, move.to]) {
    if (sq === a1) c.wQ = false;
    else if (sq === h1) c.wK = false;
    else if (sq === a8) c.bQ = false;
    else if (sq === h8) c.bK = false;
  }
}
