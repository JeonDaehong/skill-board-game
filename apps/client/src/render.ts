import {
  fileOf,
  makeSquare,
  rankOf,
  type GameState,
  type Piece,
  type Square,
} from "@skill/chess-core";

const GLYPHS: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

const LIGHT = "#e9d5b5";
const DARK = "#a97a5a";
const HIGHLIGHT = "rgba(90, 160, 90, 0.55)";
const TARGET_DOT = "rgba(40, 90, 40, 0.45)";
const SELECTED = "rgba(240, 210, 90, 0.6)";
const LAST_MOVE = "rgba(240, 210, 90, 0.35)";

export interface RenderOptions {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  flipped: boolean;
  /** 거신병: a fused 4-cell unit to overlay, with its remaining HP. */
  titan?: { cells: Square[]; hp: number } | null;
}

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private size: number;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.size = canvas.width / 8;
  }

  /** Convert a click position (canvas px) to a board square, honoring flip. */
  squareFromPixel(x: number, y: number, flipped: boolean): Square {
    const col = Math.floor(x / this.size);
    const row = Math.floor(y / this.size);
    const file = flipped ? 7 - col : col;
    const rank = flipped ? row : 7 - row;
    return makeSquare(file, rank);
  }

  render(state: GameState, opts: RenderOptions): void {
    const { ctx, size } = this;
    for (let sq = 0; sq < 64; sq++) {
      const file = fileOf(sq);
      const rank = rankOf(sq);
      const col = opts.flipped ? 7 - file : file;
      const row = opts.flipped ? rank : 7 - rank;
      const x = col * size;
      const y = row * size;

      // Board square.
      ctx.fillStyle = (file + rank) % 2 === 0 ? DARK : LIGHT;
      ctx.fillRect(x, y, size, size);

      // Last-move highlight.
      if (opts.lastMove && (sq === opts.lastMove.from || sq === opts.lastMove.to)) {
        ctx.fillStyle = LAST_MOVE;
        ctx.fillRect(x, y, size, size);
      }

      // Selection highlight.
      if (sq === opts.selected) {
        ctx.fillStyle = SELECTED;
        ctx.fillRect(x, y, size, size);
      }

      // Piece.
      const piece = state.board[sq];
      if (piece) this.drawPiece(piece, x, y);

      // Legal-move markers (dot on empty, ring on capture).
      if (opts.targets.includes(sq)) {
        this.drawTarget(x, y, !!piece);
      }
    }

    if (opts.titan) this.drawTitan(opts.titan, opts.flipped);
  }

  private drawTitan(titan: { cells: Square[]; hp: number }, flipped: boolean): void {
    const { ctx, size } = this;
    // Fill each occupied cell.
    for (const sq of titan.cells) {
      const file = fileOf(sq);
      const rank = rankOf(sq);
      const col = flipped ? 7 - file : file;
      const row = flipped ? rank : 7 - rank;
      const x = col * size;
      const y = row * size;
      ctx.fillStyle = "rgba(180, 60, 70, 0.82)";
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "rgba(255, 200, 120, 0.9)";
      ctx.lineWidth = size * 0.05;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    }
    // Label + HP on the first cell.
    const anchor = titan.cells[0]!;
    const col = (flipped ? 7 - fileOf(anchor) : fileOf(anchor)) * size;
    const row = (flipped ? rankOf(anchor) : 7 - rankOf(anchor)) * size;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(size * 0.5)}px "Segoe UI Symbol", sans-serif`;
    ctx.fillText("◆", col + size / 2, row + size / 2);
    ctx.font = `${Math.floor(size * 0.26)}px "Segoe UI", sans-serif`;
    ctx.fillText(`HP ${titan.hp}`, col + size / 2, row + size * 0.82);
  }

  private drawPiece(piece: Piece, x: number, y: number): void {
    const { ctx, size } = this;
    const glyph = GLYPHS[`${piece.color}${piece.type}`] ?? "?";
    ctx.font = `${Math.floor(size * 0.78)}px "Segoe UI Symbol", "Arial Unicode MS", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = x + size / 2;
    const cy = y + size / 2;
    // Outline for contrast on both square colors.
    ctx.lineWidth = size * 0.03;
    ctx.strokeStyle = piece.color === "w" ? "#333" : "#000";
    ctx.fillStyle = piece.color === "w" ? "#fff" : "#111";
    ctx.strokeText(glyph, cx, cy);
    ctx.fillText(glyph, cx, cy);
  }

  private drawTarget(x: number, y: number, isCapture: boolean): void {
    const { ctx, size } = this;
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.beginPath();
    if (isCapture) {
      ctx.strokeStyle = TARGET_DOT;
      ctx.lineWidth = size * 0.08;
      ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = TARGET_DOT;
      ctx.arc(cx, cy, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
