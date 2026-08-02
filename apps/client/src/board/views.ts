import {
  omok, OMOK_SIZE, type OmokState, type OmokMove,
  othello, OTHELLO_SIZE, type OthelloState, type OthelloMove,
  janggi, JANGGI_W, JANGGI_H, type JanggiState, type JanggiMove,
  quoridor, QUORIDOR_SIZE, pawnMoves, type QuoridorState, type QuoridorMove,
  type GameModule, type Player,
} from "@skill/games";
import { t } from "../i18n.js";

/** Per-game canvas view: how to draw the board and turn a click into a move. */
export interface BoardView<S = unknown, M = unknown> {
  mod: GameModule<S, M>;
  /** Extra DOM controls under the board (e.g. Quoridor wall mode). */
  controls: HTMLElement | null;
  setRerender(fn: () => void): void;
  draw(ctx: CanvasRenderingContext2D, px: number, s: S): void;
  /** Click at canvas px coords → a move to dispatch, or null (selection only). */
  click(s: S, cx: number, cy: number, px: number): M | null;
  /** Optional pointer-move preview (e.g. Quoridor wall ghost). Coords < 0 = leave. */
  hover?(s: S, cx: number, cy: number, px: number): void;
  /** Short per-player line for the in-game player bars (stones held, captures…). */
  info?(s: S, player: Player): string;
  /** What this player's pieces look like, for the bar's colour dot. */
  swatch?(player: Player): string;
}

// Theme colors shared by the board renderers (warm dark-fantasy wood).
const BOARD_BG = "#2b1d12";
const LINE = "rgba(216, 180, 90, 0.5)";
const LAST = "rgba(224, 150, 70, 0.7)";
const HINT = "rgba(216, 180, 90, 0.45)";
const STONE_B = "#140d08";
const STONE_W = "#efe4cb";

function boardBase(ctx: CanvasRenderingContext2D, px: number): void {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, px, px);
}
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, ring = false): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = fill === STONE_W ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.18)";
  ctx.stroke();
  if (ring) { ctx.strokeStyle = LAST; ctx.lineWidth = r * 0.22; ctx.stroke(); }
}

// ── Omok (15×15 intersections) ───────────────────────────────
function omokView(): BoardView<OmokState, OmokMove> {
  const N = OMOK_SIZE;
  return {
    mod: omok, controls: null, setRerender() {},
    draw(ctx, px, s) {
      boardBase(ctx, px);
      const cs = px / N;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        const p = (i + 0.5) * cs;
        ctx.beginPath(); ctx.moveTo((0.5) * cs, p); ctx.lineTo((N - 0.5) * cs, p); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p, (0.5) * cs); ctx.lineTo(p, (N - 0.5) * cs); ctx.stroke();
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = s.board[y * N + x];
        if (!c) continue;
        disc(ctx, (x + 0.5) * cs, (y + 0.5) * cs, cs * 0.42, c === "b" ? STONE_B : STONE_W, s.last === y * N + x);
      }
    },
    click(s, cx, cy, px) {
      const cs = px / N;
      const x = Math.max(0, Math.min(N - 1, Math.round(cx / cs - 0.5)));
      const y = Math.max(0, Math.min(N - 1, Math.round(cy / cs - 0.5)));
      const m: OmokMove = { x, y };
      return omok.isLegal(s, m) ? m : null;
    },
    info(s, player) {
      const n = s.board.filter((c) => c === player).length;
      return `${n} stone${n === 1 ? "" : "s"}`;
    },
    swatch: (player) => (player === "b" ? STONE_B : STONE_W),
  };
}

// ── Othello (8×8 cells) ──────────────────────────────────────
function othelloView(): BoardView<OthelloState, OthelloMove> {
  const N = OTHELLO_SIZE;
  return {
    mod: othello, controls: null, setRerender() {},
    draw(ctx, px, s) {
      ctx.fillStyle = "#243021";
      ctx.fillRect(0, 0, px, px);
      const cs = px / N;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      for (let i = 0; i <= N; i++) {
        ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, px); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(px, i * cs); ctx.stroke();
      }
      const legal = new Set(othello.legalMoves(s).map((m) => m.y * N + m.x));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const cxp = (x + 0.5) * cs, cyp = (y + 0.5) * cs;
        const c = s.board[y * N + x];
        if (c) disc(ctx, cxp, cyp, cs * 0.4, c === "b" ? STONE_B : STONE_W, s.last === y * N + x);
        else if (legal.has(y * N + x)) { ctx.fillStyle = "rgba(200,170,110,0.35)"; ctx.beginPath(); ctx.arc(cxp, cyp, cs * 0.12, 0, Math.PI * 2); ctx.fill(); }
      }
    },
    click(s, cx, cy, px) {
      const cs = px / N;
      const x = Math.floor(cx / cs), y = Math.floor(cy / cs);
      const m: OthelloMove = { x, y };
      return othello.isLegal(s, m) ? m : null;
    },
  };
}

// ── Janggi (9×10 intersections, palace, hanja) ───────────────
/** Starting count of each piece type, per side — used to derive captures. */
const JANGGI_SETUP: Record<string, number> = { k: 1, a: 2, e: 2, h: 2, r: 2, c: 2, s: 5 };

const JGLYPH: Record<string, [string, string]> = {
  k: ["楚", "漢"], a: ["士", "士"], e: ["象", "象"], h: ["馬", "馬"], r: ["車", "車"], c: ["包", "包"], s: ["卒", "兵"],
};
function janggiView(): BoardView<JanggiState, JanggiMove> {
  const W = JANGGI_W, H = JANGGI_H;
  let sel: [number, number] | null = null;
  let rerender = () => {};
  const gx = (x: number, cs: number) => (x + 0.5) * cs;
  const gy = (y: number, cs: number) => (y + 0.5) * cs;
  return {
    mod: janggi, controls: null,
    setRerender(fn) { rerender = fn; },
    draw(ctx, px, s) {
      boardBase(ctx, px);
      const csx = px / W, csy = px / H, cs = Math.min(csx, csy);
      ctx.strokeStyle = LINE; ctx.lineWidth = 1;
      for (let x = 0; x < W; x++) { ctx.beginPath(); ctx.moveTo(gx(x, csx), gy(0, csy)); ctx.lineTo(gx(x, csx), gy(H - 1, csy)); ctx.stroke(); }
      for (let y = 0; y < H; y++) { ctx.beginPath(); ctx.moveTo(gx(0, csx), gy(y, csy)); ctx.lineTo(gx(W - 1, csx), gy(y, csy)); ctx.stroke(); }
      // palace diagonals
      for (const [y0] of [[0], [7]] as number[][]) {
        ctx.beginPath(); ctx.moveTo(gx(3, csx), gy(y0!, csy)); ctx.lineTo(gx(5, csx), gy(y0! + 2, csy)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx(5, csx), gy(y0!, csy)); ctx.lineTo(gx(3, csx), gy(y0! + 2, csy)); ctx.stroke();
      }
      const dests = sel ? janggi.legalMoves(s).filter((m) => m.from[0] === sel![0] && m.from[1] === sel![1]).map((m) => m.to[1] * W + m.to[0]) : [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (dests.includes(y * W + x)) { ctx.fillStyle = HINT; ctx.beginPath(); ctx.arc(gx(x, csx), gy(y, csy), cs * 0.16, 0, Math.PI * 2); ctx.fill(); }
        const p = s.board[y * W + x];
        if (!p) continue;
        const r = cs * 0.4;
        const isB = p.c === "b";
        disc(ctx, gx(x, csx), gy(y, csy), r, isB ? "#1c3f6e" : "#7a2424");
        if (sel && sel[0] === x && sel[1] === y) { ctx.strokeStyle = "#f0e0b8"; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.arc(gx(x, csx), gy(y, csy), r, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = isB ? "#cfe0ff" : "#ffd9d9";
        ctx.font = `700 ${Math.floor(r * 1.1)}px "Gowun Batang", serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(JGLYPH[p.t]![isB ? 0 : 1], gx(x, csx), gy(y, csy) + r * 0.06);
      }
    },
    info(s, player) {
      const enemy: Player = player === "b" ? "w" : "b";
      const left: Record<string, number> = {};
      for (const p of s.board) if (p && p.c === enemy) left[p.t] = (left[p.t] ?? 0) + 1;
      const taken: string[] = [];
      for (const [t, n] of Object.entries(JANGGI_SETUP)) {
        for (let i = (left[t] ?? 0); i < n; i++) taken.push(JGLYPH[t]![enemy === "b" ? 0 : 1]);
      }
      return taken.length ? taken.join(" ") : "no captures";
    },
    swatch: (player) => (player === "b" ? "#1c3f6e" : "#7a2424"),
    click(s, cx, cy, px) {
      const csx = px / W, csy = px / H;
      const x = Math.max(0, Math.min(W - 1, Math.round(cx / csx - 0.5)));
      const y = Math.max(0, Math.min(H - 1, Math.round(cy / csy - 0.5)));
      if (sel) {
        const m: JanggiMove = { from: sel, to: [x, y] };
        if (janggi.isLegal(s, m)) { sel = null; return m; }
      }
      const p = s.board[y * W + x];
      sel = p && p.c === s.turn ? [x, y] : null;
      rerender();
      return null;
    },
  };
}

// ── Quoridor (9×9 cells + walls) ─────────────────────────────
function quoridorView(me: Player): BoardView<QuoridorState, QuoridorMove> {
  const N = QUORIDOR_SIZE;
  const S = N - 1;
  let mode: "move" | "wall" = "move";
  let orient: "h" | "v" = "h";
  let ghost: { x: number; y: number } | null = null;
  let rerender = () => {};

  const moveBtn = document.createElement("button");
  const hBtn = document.createElement("button");
  const vBtn = document.createElement("button");
  const counter = document.createElement("span");
  counter.className = "quoridor-walls";
  const refresh = () => {
    moveBtn.textContent = t("quoridor.move");
    hBtn.textContent = t("quoridor.hwall");
    vBtn.textContent = t("quoridor.vwall");
    const sel = (on: boolean) => `btn btn-small ${on ? "btn-primary" : "btn-ghost"}`;
    moveBtn.className = sel(mode === "move");
    hBtn.className = sel(mode === "wall" && orient === "h");
    vBtn.className = sel(mode === "wall" && orient === "v");
  };
  moveBtn.onclick = () => { mode = "move"; ghost = null; refresh(); rerender(); };
  hBtn.onclick = () => { mode = "wall"; orient = "h"; refresh(); rerender(); };
  vBtn.onclick = () => { mode = "wall"; orient = "v"; refresh(); rerender(); };
  refresh();
  const controls = document.createElement("div");
  controls.className = "quoridor-controls";
  controls.append(moveBtn, hBtn, vBtn, counter);

  const slotFromPx = (cx: number, cy: number, cs: number) => ({
    x: Math.max(0, Math.min(S - 1, Math.round(cx / cs) - 1)),
    y: Math.max(0, Math.min(S - 1, Math.round(cy / cs) - 1)),
  });
  const drawWall = (ctx: CanvasRenderingContext2D, x: number, y: number, o: "h" | "v", cs: number, color: string) => {
    ctx.fillStyle = color;
    const t = cs * 0.18;
    if (o === "h") ctx.fillRect(x * cs + cs * 0.08, (y + 1) * cs - t / 2, cs * 1.84, t);
    else ctx.fillRect((x + 1) * cs - t / 2, y * cs + cs * 0.08, t, cs * 1.84);
  };

  return {
    mod: quoridor, controls,
    setRerender(fn) { rerender = fn; refresh(); },
    draw(ctx, px, s) {
      counter.textContent = `🧱 Walls left — you: ${s.walls[me]}  opponent: ${s.walls[me === "b" ? "w" : "b"]}`;
      boardBase(ctx, px);
      const cs = px / N;
      ctx.strokeStyle = LINE; ctx.lineWidth = 1;
      for (let i = 0; i <= N; i++) {
        ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, px); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(px, i * cs); ctx.stroke();
      }
      // my goal row tint
      const goalY = me === "b" ? N - 1 : 0;
      ctx.fillStyle = "rgba(224,150,70,0.12)";
      ctx.fillRect(0, goalY * cs, px, cs);
      // legal pawn destinations (move mode)
      if (mode === "move") {
        for (const [tx, ty] of pawnMoves(s, s.turn)) {
          ctx.fillStyle = HINT;
          ctx.beginPath(); ctx.arc((tx + 0.5) * cs, (ty + 0.5) * cs, cs * 0.17, 0, Math.PI * 2); ctx.fill();
        }
      }
      // placed walls
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (s.hw[y * S + x]) drawWall(ctx, x, y, "h", cs, "#d9b45f");
        if (s.vw[y * S + x]) drawWall(ctx, x, y, "v", cs, "#d9b45f");
      }
      // ghost wall preview (wall mode)
      if (mode === "wall" && ghost) {
        const legal = quoridor.isLegal(s, { kind: "wall", x: ghost.x, y: ghost.y, o: orient });
        drawWall(ctx, ghost.x, ghost.y, orient, cs, legal ? "rgba(224,150,70,0.82)" : "rgba(255,80,80,0.6)");
      }
      // pawns
      disc(ctx, (s.pb[0] + 0.5) * cs, (s.pb[1] + 0.5) * cs, cs * 0.34, "#1c3f6e");
      disc(ctx, (s.pw[0] + 0.5) * cs, (s.pw[1] + 0.5) * cs, cs * 0.34, "#7a2424");
    },
    info(s, player) {
      const n = s.walls[player];
      return `${n} wall${n === 1 ? "" : "s"} left`;
    },
    swatch: (player) => (player === "b" ? "#1c3f6e" : "#7a2424"),
    hover(s, cx, cy, px) {
      if (mode !== "wall" || cx < 0) { if (ghost) { ghost = null; rerender(); } return; }
      const cs = px / N;
      const g = slotFromPx(cx, cy, cs);
      if (!ghost || ghost.x !== g.x || ghost.y !== g.y) { ghost = g; rerender(); }
    },
    click(s, cx, cy, px) {
      const cs = px / N;
      if (mode === "move") {
        const x = Math.floor(cx / cs), y = Math.floor(cy / cs);
        const m: QuoridorMove = { kind: "move", to: [x, y] };
        return quoridor.isLegal(s, m) ? m : null;
      }
      const g = slotFromPx(cx, cy, cs);
      const m: QuoridorMove = { kind: "wall", x: g.x, y: g.y, o: orient };
      return quoridor.isLegal(s, m) ? m : null;
    },
  };
}

export function getView(gameId: string, me: Player): BoardView | null {
  switch (gameId) {
    case "omok": return omokView() as BoardView;
    case "othello": return othelloView() as BoardView;
    case "janggi": return janggiView() as BoardView;
    case "quoridor": return quoridorView(me) as BoardView;
    default: return null;
  }
}
