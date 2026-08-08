import {
  STANDARD_DIMS,
  fileOf,
  makeSquare,
  rankOf,
  type Color,
  type Dims,
  type GameState,
  type Piece,
  type PieceType,
  type Square,
} from "@skill/chess-core";
import { pieceUrl, textureUrl, tokenUrl, type TokenName } from "./ui/art.js";
import { getBoardTheme, getPieceSkin, skinPieceUrl, themeTextureUrls } from "./skins.js";

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

/**
 * The equipped skin's sprites, kept apart from the default set on purpose.
 *
 * A skin dresses *your own army* and nothing else. Overwriting SPRITES turned
 * both sides into demons, which is not what a skin is: the opponent has their own
 * cosmetics and sees their own, and none of it crosses the wire. So the renderer
 * is told which colour is the viewer's and reads this store for that colour only.
 */
const SKINNED: Record<string, HTMLImageElement> = {};

/** Square textures, keyed by the name they were sliced under. */
const TEXTURES: Record<string, HTMLImageElement> = {};

/**
 * Bumped whenever the texture set is replaced. Patterns are scaled and cached
 * per renderer, so a renderer that outlives a theme change has to be told that
 * what it cached is no longer what the board is made of.
 */
let textureEpoch = 0;

function loadImage(store: Record<string, HTMLImageElement>, key: string, url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { store[key] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** Enchant / terrain counters, keyed by token name. */
const TOKENS: Record<string, HTMLImageElement> = {};

const TOKEN_NAMES: TokenName[] = [
  "sandbag", "leap", "disarm", "swamp", "mine", "bond-chain", "fate-chain", "crown",
];

/**
 * Load the art the board is painted with, for whatever skin is equipped.
 *
 * The default set is loaded first and the skin's own files are layered over it,
 * so a skin whose sheet has not been drawn yet degrades to the default piece by
 * piece instead of leaving holes — `loadImage` resolves without storing when a
 * file is missing, which is exactly the behaviour that makes this work. That
 * matters because the shop sells these before the art exists.
 */
export function preloadPieces(
  skinId = getPieceSkin(),
  themeId = getBoardTheme(),
): Promise<void> {
  const [light, dark] = themeTextureUrls(themeId);
  // The skinned set is rebuilt from scratch: leaving the previous skin's sprites
  // behind would dress your army in whatever you wore last for any piece the new
  // skin happens not to provide.
  for (const code of Object.keys(SKINNED)) delete SKINNED[code];
  return Promise.all([
    ...CODES.map((code) => loadImage(SPRITES, code, pieceUrl(code))),
    ...TOKEN_NAMES.map((name) => loadImage(TOKENS, name, tokenUrl(name))),
    loadImage(TEXTURES, "light", textureUrl("stone-light")),
    loadImage(TEXTURES, "dark", textureUrl("wood-dark")),
  ])
    .then(() =>
      Promise.all([
        ...CODES.map((code) => loadImage(SKINNED, code, skinPieceUrl(code, skinId))),
        loadImage(TEXTURES, "light", light),
        loadImage(TEXTURES, "dark", dark),
      ]),
    )
    .then(() => {
      textureEpoch++;
    });
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
  /**
   * The colour the viewer is playing. Only that side's pieces wear the equipped
   * skin — a skin dresses your own army, and the opponent is running their own
   * cosmetics on their own screen. Omitted outside a match, where nobody owns a
   * side and the default set is the honest answer.
   */
  mine?: Color;
  /** Titan: a fused 4-cell unit to overlay, with its remaining HP. */
  titan?: { cells: Square[]; hp: number } | null;
  /** Squares tinted as a legal drop zone (master mode summoning). */
  zone?: Square[];
  /** Squares marked as unable to move (summoned this turn, locked by a skill). */
  stuck?: Square[];
  /** Squares a card just changed, ringed so the eye lands on them. */
  changed?: Square[];
  /**
   * Badges sitting on a square: an enchant stuck to the piece, a patch of
   * terrain. Without these an enchant is invisible and the board lies about
   * what the pieces can do.
   */
  marks?: {
    sq: Square;
    glyph: string;
    token?: TokenName | null;
    tone?: "good" | "bad";
    /** Turns until it lifts; null or absent means "until something dispels it". */
    turns?: number | null;
  }[];
}

const ZONE = "rgba(90, 140, 220, 0.34)";
/** Digits on an enchant counter: tabular, so a 2 and a 1 sit the same. */
const MARK_FONT = '"Segoe UI", sans-serif';
const STUCK = "rgba(30, 30, 40, 0.42)";

/**
 * How tall each piece stands, as a fraction of its square.
 *
 * The order is the one every physical chess set uses — king tallest, pawn
 * shortest, rook squat — and it is declared rather than read off the artwork so
 * it survives any skin. Without it a set of trimmed sprites all rendered at one
 * height, and a board where the pawn is the same size as the king reads as a
 * board of tokens rather than an army.
 */
const PIECE_HEIGHT: Record<PieceType, number> = {
  k: 0.92, q: 0.88, b: 0.84, n: 0.82, r: 0.76, p: 0.68,
};

/**
 * Something happening on the board, over time.
 *
 * Pieces used to change squares between two frames, which is the same picture a
 * board with no move in it would draw — a card that slid a piece two squares
 * sideways was indistinguishable from a repaint. Every board change is handed
 * here as one of these and the renderer runs it to completion.
 */
export type BoardAnim =
  /** A piece travelling between two squares, by move or by card. */
  | { kind: "move"; from: Square; to: Square; piece: Piece }
  /** A piece leaving the board: captured, mined, assassinated. */
  | { kind: "slain"; sq: Square; piece: Piece }
  /** A piece arriving out of nowhere: summoned, doubled, promoted. */
  | { kind: "spawn"; sq: Square; piece: Piece }
  /** A square a card touched without moving anything off it. */
  | { kind: "flash"; sq: Square };

const MOVE_MS = 190;
const SLAIN_MS = 300;
const SPAWN_MS = 260;
const FLASH_MS = 560;

const DURATION: Record<BoardAnim["kind"], number> = {
  move: MOVE_MS, slain: SLAIN_MS, spawn: SPAWN_MS, flash: FLASH_MS,
};

/** How long the longest of these will run, so a caller can wait it out. */
export function animLength(anims: BoardAnim[]): number {
  return anims.reduce((n, a) => Math.max(n, DURATION[a.kind]), 0);
}

interface Live { anim: BoardAnim; start: number }

/** Decelerating, for travel. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private size: number;
  /**
   * The board this renderer is currently sized for. Master mode is 10x10, so
   * neither the square size nor the pixel→square mapping can be a constant.
   */
  private dims: Dims = STANDARD_DIMS;
  /** Lazily built square patterns; `null` means "texture unavailable". */
  private patterns: Partial<Record<"light" | "dark", CanvasPattern | null>> = {};
  /** The texture set those patterns were built from. */
  private epoch = -1;
  /** Animations in flight, and the frame loop that is driving them. */
  private live: Live[] = [];
  private frame: number | undefined;
  /** The last thing painted, so a frame can repaint it with time moved on. */
  private last: { state: GameState; opts: RenderOptions } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.size = canvas.width / this.dims.width;
  }

  /**
   * Point the renderer at a board of these dimensions. Square size changes with
   * it, which invalidates the texture patterns — they are scaled to the square.
   */
  setDims(dims: Dims): void {
    if (dims.width === this.dims.width && dims.height === this.dims.height) return;
    this.dims = { width: dims.width, height: dims.height };
    this.size = this.canvas.width / dims.width;
    this.patterns = {};
  }

  /**
   * Re-point the backing store at `px` device pixels square. The duel screen
   * sizes the board off whatever height the rest of the column leaves, so its
   * on-screen size is not known until it is laid out — and a 640px buffer
   * stretched across an 800px board is a soft board. Both board shapes here are
   * square, so one dimension is enough.
   *
   * Returns true when the buffer actually changed, so a caller watching for
   * resizes knows whether it owes a repaint.
   */
  resize(px: number): boolean {
    if (this.canvas.width === px) return false;
    this.canvas.width = px;
    this.canvas.height = px;
    this.size = px / this.dims.width;
    this.patterns = {}; // scaled to the square, so a new square invalidates them
    return true;
  }

  /** Convert a click position (canvas px) to a board square, honoring flip. */
  squareFromPixel(x: number, y: number, flipped: boolean): Square {
    const { width, height } = this.dims;
    const col = Math.floor(x / this.size);
    const row = Math.floor(y / this.size);
    const file = flipped ? width - 1 - col : col;
    const rank = flipped ? row : height - 1 - row;
    return makeSquare(file, rank, this.dims);
  }

  /** Top-left canvas pixel of a square, honoring flip. */
  private pixelOf(sq: Square, flipped: boolean): { x: number; y: number } {
    const file = fileOf(sq, this.dims);
    const rank = rankOf(sq, this.dims);
    const col = flipped ? this.dims.width - 1 - file : file;
    const row = flipped ? rank : this.dims.height - 1 - rank;
    return { x: col * this.size, y: row * this.size };
  }

  /**
   * Tiling fill for a square colour, scaled down so the grain reads at 80px per
   * square. Anchored to the canvas origin, so the material runs continuously
   * across the board instead of restarting in every square.
   */
  private squareFill(kind: "light" | "dark"): string | CanvasPattern {
    if (this.epoch !== textureEpoch) {
      this.patterns = {};
      this.epoch = textureEpoch;
    }
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

  /**
   * Start these animations and run them to completion. The board keeps painting
   * from whatever state it was last given, so this is safe to call before or
   * after the state that produced them lands.
   */
  play(anims: BoardAnim[]): void {
    if (anims.length === 0) return;
    const now = performance.now();
    this.live.push(...anims.map((anim) => ({ anim, start: now })));
    this.pump();
  }

  /** True while something is still moving — a caller may want to hold off. */
  animating(): boolean {
    return this.live.length > 0;
  }

  private pump(): void {
    if (this.frame !== undefined) return;
    const step = (): void => {
      this.frame = undefined;
      const now = performance.now();
      this.live = this.live.filter((l) => now - l.start < DURATION[l.anim.kind]);
      if (this.last) this.paint(this.last.state, this.last.opts, now);
      if (this.live.length > 0) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Drop everything in flight — a rematch, or leaving the screen. */
  stop(): void {
    this.live = [];
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  render(state: GameState, opts: RenderOptions): void {
    this.last = { state, opts };
    this.paint(state, opts, performance.now());
    if (this.live.length > 0) this.pump();
  }

  private paint(state: GameState, opts: RenderOptions, now: number): void {
    this.setDims(state);
    const { ctx, size } = this;
    // A piece in flight is drawn by its animation, on top of everything, so the
    // static pass has to leave its destination square empty — otherwise the
    // piece is at both ends of the move at once.
    const inFlight = new Set<Square>();
    for (const l of this.live) {
      if (l.anim.kind === "move") inFlight.add(l.anim.to);
      if (l.anim.kind === "spawn") inFlight.add(l.anim.sq);
    }
    for (let sq = 0; sq < state.board.length; sq++) {
      const file = fileOf(sq, state);
      const rank = rankOf(sq, state);
      const { x, y } = this.pixelOf(sq, opts.flipped);

      // Board square. The textures sit close together in value, so each side is
      // pushed apart a little — otherwise the checker pattern barely reads.
      const isDark = (file + rank) % 2 === 0;
      ctx.fillStyle = this.squareFill(isDark ? "dark" : "light");
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = isDark ? SQUARE_DEEPEN : SQUARE_LIFT;
      ctx.fillRect(x, y, size, size);

      // Summoning zone, under everything else — it is a property of the square.
      if (opts.zone?.includes(sq)) {
        ctx.fillStyle = ZONE;
        ctx.fillRect(x, y, size, size);
      }

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
      if (piece && !inFlight.has(sq)) this.drawPiece(piece, x, y, opts.mine);

      // A piece that cannot move is greyed where it stands, so "why won't it
      // pick up" is answered on the board rather than by a rejected click.
      if (opts.stuck?.includes(sq)) {
        ctx.fillStyle = STUCK;
        ctx.fillRect(x, y, size, size);
      }

      // Legal-move markers (dot on empty, ring on capture).
      if (opts.targets.includes(sq)) {
        this.drawTarget(x, y, !!piece);
      }

      // Enchants and terrain, down the left edge of the square. All of them,
      // not the first: a piece under two effects used to show one, so the
      // second was something you only found out about by it happening.
      const here = opts.marks?.filter((m) => m.sq === sq) ?? [];
      for (const [slot, mark] of here.entries()) {
        const art = mark.token ? TOKENS[mark.token] : undefined;
        const r = size * 0.19;
        const cx = x + r + size * 0.05;
        // Stacked downwards, overlapping slightly so three still fit inside
        // the square rather than spilling onto the next rank.
        const cy = y + r + size * 0.05 + slot * r * 1.7;
        ctx.save();
        if (art) {
          // The painted counter carries its own rim, so it needs no backing —
          // just a tint ring saying whose effect it is.
          ctx.drawImage(art, cx - r, cy - r, r * 2, r * 2);
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.04, 0, Math.PI * 2);
          ctx.strokeStyle = mark.tone === "good" ? "rgba(143, 195, 90, 0.85)" : "rgba(224, 100, 90, 0.85)";
          ctx.lineWidth = Math.max(1.5, size * 0.025);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = mark.tone === "good" ? "rgba(40, 62, 26, 0.9)" : "rgba(58, 20, 14, 0.9)";
          ctx.fill();
          ctx.strokeStyle = mark.tone === "good" ? "#8fc35a" : "#e0645a";
          ctx.lineWidth = Math.max(1, size * 0.02);
          ctx.stroke();
          ctx.fillStyle = "#f2e6c8";
          ctx.font = `${Math.round(r * 1.5)}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(mark.glyph, cx, cy + r * 0.06);
        }
        // How much longer it has, on the counter's shoulder. An effect you can
        // see but cannot time is one you cannot play around: "cursed" and
        // "cursed for one more turn" are different positions.
        if (typeof mark.turns === "number") {
          const bx = cx + r * 0.78;
          const by = cy + r * 0.78;
          const br = r * 0.62;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(16, 11, 7, 0.94)";
          ctx.fill();
          ctx.strokeStyle = mark.tone === "good" ? "#8fc35a" : "#e0645a";
          ctx.lineWidth = Math.max(1, size * 0.014);
          ctx.stroke();
          ctx.fillStyle = "#f2e6c8";
          ctx.font = `700 ${Math.round(br * 1.4)}px ${MARK_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(mark.turns), bx, by + br * 0.06);
        }
        ctx.restore();
      }

      // What a card just did, ringed in gold so the change is findable.
      if (opts.changed?.includes(sq)) {
        ctx.save();
        ctx.strokeStyle = "#f2d98d";
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.shadowColor = "rgba(242, 217, 141, 0.8)";
        ctx.shadowBlur = size * 0.35;
        ctx.strokeRect(x + ctx.lineWidth, y + ctx.lineWidth, size - ctx.lineWidth * 2, size - ctx.lineWidth * 2);
        ctx.restore();
      }
    }

    if (opts.titan) this.drawTitan(opts.titan, opts.flipped);
    this.drawAnims(opts.flipped, now, opts.mine);
  }

  /** Everything in motion, over the finished board. */
  private drawAnims(flipped: boolean, now: number, mine?: Color): void {
    const { ctx, size } = this;
    for (const { anim, start } of this.live) {
      const t = Math.min(1, (now - start) / DURATION[anim.kind]);

      if (anim.kind === "move") {
        const a = this.pixelOf(anim.from, flipped);
        const b = this.pixelOf(anim.to, flipped);
        const k = easeOut(t);
        // A shadow that grows as the piece travels reads as a piece lifted off
        // the board and put down again, rather than one sliding along it.
        const lift = Math.sin(t * Math.PI) * size * 0.06;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(a.x + (b.x - a.x) * k + size / 2, a.y + (b.y - a.y) * k + size * 0.84,
          size * 0.26, size * 0.09, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fill();
        ctx.restore();
        this.drawPiece(anim.piece, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - lift, mine);
        continue;
      }

      if (anim.kind === "slain") {
        const { x, y } = this.pixelOf(anim.sq, flipped);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.translate(x + size / 2, y + size / 2);
        ctx.scale(1 + t * 0.45, 1 + t * 0.45);
        ctx.rotate(t * 0.5);
        this.drawPiece(anim.piece, -size / 2, -size / 2, mine);
        ctx.restore();
        // A ring blowing outward, so a death off-board still catches the eye.
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.75;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * (0.25 + t * 0.45), 0, Math.PI * 2);
        ctx.strokeStyle = "#e0645a";
        ctx.lineWidth = Math.max(2, size * 0.07 * (1 - t));
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (anim.kind === "spawn") {
        const { x, y } = this.pixelOf(anim.sq, flipped);
        const k = easeOut(t);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(x + size / 2, y + size / 2);
        const s = 0.5 + k * 0.5;
        ctx.scale(s, s);
        this.drawPiece(anim.piece, -size / 2, -size / 2, mine);
        ctx.restore();
        continue;
      }

      // A square a card touched. Two pulses, so it is read as deliberate.
      const { x, y } = this.pixelOf(anim.sq, flipped);
      const pulse = Math.abs(Math.sin(t * Math.PI * 2));
      ctx.save();
      ctx.globalAlpha = (1 - t) * pulse;
      ctx.strokeStyle = "#f2d98d";
      ctx.lineWidth = Math.max(2, size * 0.08);
      ctx.shadowColor = "rgba(242, 217, 141, 0.9)";
      ctx.shadowBlur = size * 0.4;
      ctx.strokeRect(x + ctx.lineWidth, y + ctx.lineWidth, size - ctx.lineWidth * 2, size - ctx.lineWidth * 2);
      ctx.restore();
    }
  }

  private drawTitan(titan: { cells: Square[]; hp: number }, flipped: boolean): void {
    const { ctx, size } = this;
    // Fill each occupied cell.
    for (const sq of titan.cells) {
      const { x, y } = this.pixelOf(sq, flipped);
      ctx.fillStyle = "rgba(180, 60, 70, 0.82)";
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "rgba(255, 200, 120, 0.9)";
      ctx.lineWidth = size * 0.05;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    }
    // Label + HP on the first cell.
    const { x, y } = this.pixelOf(titan.cells[0]!, flipped);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(size * 0.5)}px "Segoe UI Symbol", sans-serif`;
    ctx.fillText("◆", x + size / 2, y + size / 2);
    ctx.font = `${Math.floor(size * 0.26)}px "Segoe UI", sans-serif`;
    ctx.fillText(`HP ${titan.hp}`, x + size / 2, y + size * 0.82);
  }

  /**
   * The sprite for a piece, honouring who is looking.
   *
   * Only the viewer's own pieces wear the equipped skin. `mine` is undefined
   * outside a match (the deck builder's preview board), where there is no viewer
   * and so no skin either.
   */
  private spriteFor(piece: Piece, mine?: Color): HTMLImageElement | undefined {
    const code = `${piece.color}${piece.type}`;
    if (mine && piece.color === mine) return SKINNED[code] ?? SPRITES[code];
    return SPRITES[code];
  }

  private drawPiece(piece: Piece, x: number, y: number, mine?: Color): void {
    const { ctx, size } = this;
    const code = `${piece.color}${piece.type}`;
    const sprite = this.spriteFor(piece, mine);

    if (sprite) {
      // Fit the sprite inside its own height for the rank it holds, then centre
      // it in the square.
      //
      // Every piece used to be drawn at 90% of the square's height and sat on the
      // base. That flattened the whole set: a pawn came out as tall as a king, and
      // the sprite's own proportions could not fix it because a trimmed sprite's
      // pixel height says nothing useful across skins — the demon pawn is a
      // crouching imp that fills 267px, exactly as many as that skin's knight.
      // So the hierarchy is declared here, per piece type, and holds for any skin.
      const box = size * PIECE_HEIGHT[piece.type];
      const aspect = sprite.width / sprite.height;
      // Bind on whichever axis runs out first, so a wide sculpt cannot spill into
      // the neighbouring square.
      const maxW = size * 0.92;
      let h = box;
      let w = box * aspect;
      if (w > maxW) {
        w = maxW;
        h = maxW / aspect;
      }
      const dx = x + (size - w) / 2;
      const dy = y + (size - h) / 2;

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
