import {
  fileOf,
  makeSquare,
  rankOf,
  type GameState,
  type Piece,
  type Square,
} from "@skill/chess-core";
import { pieceUrl, textureUrl } from "./ui/art.js";

const CODES = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];

const GLYPHS: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};

/**
 * Painted piece sprites, preloaded once and shared by every board. Until they
 * finish decoding (and if one ever fails to load) the renderer falls back to the
 * unicode glyphs, so the board is never blank.
 */
const SPRITES: Record<string, HTMLImageElement> = {};

/** Square textures, keyed by the name they were sliced under. */
const TEXTURES: Record<string, HTMLImageElement> = {};

function loadImage(store: Record<string, HTMLImageElement>, key: string, url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { store[key] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  });
}

export function preloadPieces(): Promise<void> {
  return Promise.all([
    ...CODES.map((code) => loadImage(SPRITES, code, pieceUrl(code))),
    loadImage(TEXTURES, "light", textureUrl("stone-light")),
    loadImage(TEXTURES, "dark", textureUrl("wood-dark")),
  ]).then(() => undefined);
}

const LIGHT = "#e9d5b5";
const DARK = "#a97a5a";
const SQUARE_DEEPEN = "rgba(0, 0, 0, 0.22)";
const SQUARE_LIFT = "rgba(255, 246, 225, 0.16)";
const HIGHLIGHT = "rgba(90, 160, 90, 0.55)";
const TARGET_DOT = "rgba(40, 90, 40, 0.45)";
const SELECTED = "rgba(240, 210, 90, 0.6)";
const LAST_MOVE = "rgba(240, 210, 90, 0.35)";

export interface RenderOptions {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  flipped: boolean;
  /** Titan: a fused 4-cell unit to overlay, with its remaining HP. */
  titan?: { cells: Square[]; hp: number } | null;
}

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private size: number;
  /** Lazily built square patterns; `null` means "texture unavailable". */
  private patterns: Partial<Record<"light" | "dark", CanvasPattern | null>> = {};

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

  /**
   * Tiling fill for a square colour, scaled down so the grain reads at 80px per
   * square. Anchored to the canvas origin, so the material runs continuously
   * across the board instead of restarting in every square.
   */
  private squareFill(kind: "light" | "dark"): string | CanvasPattern {
    const cached = this.patterns[kind];
    if (cached) return cached;

    // Nothing is cached on a miss: the first paint can land before the textures
    // finish decoding, and caching the failure would keep the board flat forever.
    const tex = TEXTURES[kind];
    if (!tex) return kind === "light" ? LIGHT : DARK;

    const pat = this.ctx.createPattern(tex, "repeat");
    if (!pat) return kind === "light" ? LIGHT : DARK;
    const s = (this.size * 1.6) / tex.width;
    pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    this.patterns[kind] = pat;
    return pat;
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

      // Board square. The textures sit close together in value, so each side is
      // pushed apart a little — otherwise the checker pattern barely reads.
      const isDark = (file + rank) % 2 === 0;
      ctx.fillStyle = this.squareFill(isDark ? "dark" : "light");
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = isDark ? SQUARE_DEEPEN : SQUARE_LIFT;
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
    const code = `${piece.color}${piece.type}`;
    const sprite = SPRITES[code];

    if (sprite) {
      // Fit inside the square by height, keeping the sculpt's own proportions so
      // a king still reads as taller than a pawn, and sit it on the square's base.
      const h = size * 0.9;
      const w = (sprite.width / sprite.height) * h;
      const dx = x + (size - w) / 2;
      const dy = y + size - h - size * 0.04;

      // Carved ivory on pale stone and dark oak on dark walnut are nearly the
      // same value, so each piece gets a halo in the opposite direction: white
      // pieces a shadow to sit them down, black pieces a warm rim to lift them.
      ctx.save();
      ctx.shadowBlur = size * 0.09;
      if (piece.color === "w") {
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.drawImage(sprite, dx, dy, w, h);
      } else {
        ctx.shadowColor = "rgba(255, 228, 168, 0.95)";
        // Canvas shadows are faint at this radius; restacking builds them up.
        for (let i = 0; i < 3; i++) ctx.drawImage(sprite, dx, dy, w, h);
      }
      ctx.restore();

      ctx.drawImage(sprite, dx, dy, w, h);
      return;
    }

    const glyph = GLYPHS[code] ?? "?";
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
