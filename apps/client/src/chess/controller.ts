import {
  fileOf,
  generateLegalMoves,
  makeSquare,
  onBoard,
  opposite,
  rankOf,
  type Color,
  type PieceType,
  type SkillRules,
  type Square,
} from "@skill/chess-core";
import type { MatchState } from "@skill/engine";
import { el, type AppContext, type Screen } from "../router.js";
import { BoardRenderer, preloadPieces, type RenderOptions } from "../render.js";
import { skillById } from "../skills.js";
import { createLocalSession, type Session } from "./session.js";
import { menuScreen } from "../screens/menu.js";
import { gameName, skillName, t, tPassthrough } from "../i18n.js";

export interface ChessOptions {
  humanColor: Color;
  depth: number;
}

/** Single-player entry: build a local session, then mount the shared game view.
 *  Plain chess for now — no skills (the card-deck system is being reworked). */
export function makeChess(opts: ChessOptions): Screen {
  return (ctx) => {
    const session = createLocalSession({
      humanColor: opts.humanColor,
      humanDeck: [],
      aiDeck: [],
      depth: opts.depth,
    });
    return mountGame(ctx, session, () => ctx.navigate(menuScreen));
  };
}

/** How long the final position stays visible before the result card covers it. */
const GAME_OVER_DELAY_MS = 1100;

const IMMEDIATE: Record<string, string> = {
  "one-more": "one-more",
  cloak: "cloak",
  liberation: "liberation",
  undo: "undo",
  "titan-fusion": "titan-fuse",
};
const SINGLE_TARGET = new Set(["iron-guard", "evolve-gamble", "revive-gamble"]);
const SRC_DEST = new Set(["retreat", "cross-diagonal", "raid-march"]);

const TITAN_DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * The shared game screen. It never mutates game state directly — it renders the
 * session's MatchState and turns clicks into Actions. Works identically for a
 * local AI session and an online (server) session.
 */
export function mountGame(ctx: AppContext, session: Session, onExit: () => void): () => void {
  const me = session.myColor;
  const opp = opposite(me);
  const flipped = me === "b";

  // Purely local UI state (never leaves the client).
  let selected: Square | null = null;
  let targeting: { skillId: string; picks: Square[] } | null = null;
  let foresightPeek = false;
  let titanSelected = false;
  let sacSource: Square | null = null;
  // Game-over / rematch UI state (client-only).
  let gameOverUp = false;
  let rematchPending = false;
  let opponentLeft = false;
  // The overlay covers the board, so it waits a beat — otherwise the mating move
  // is hidden behind the result card the instant it is played.
  let overlayTimer: number | undefined;

  const canvas = el("canvas", { class: "board-canvas" }) as HTMLCanvasElement;
  canvas.width = 640;
  canvas.height = 640;
  const statusEl = el("div", { class: "game-status" });
  const overlay = el("div", { class: "game-overlay hidden" });
  const oppStrip = el("div", { class: "opp-strip" });
  const skillBar = el("div", { class: "skill-bar" });
  const sacrificeBar = el("div", { class: "sacrifice-bar hidden" }, [
    el("button", { class: "start-btn", text: t("game.endTurn"), onclick: () => session.dispatch({ type: "sacrifice-end" }) }),
  ]);
  const toast = el("div", { class: "toast hidden" });

  ctx.root.appendChild(
    el("div", { class: "screen chess-screen" }, [
      el("div", { class: "game-topbar" }, [
        el("button", { class: "back-btn", text: t("common.leave"), onclick: onExit }),
        el("div", { class: "game-heading" }, [el("span", { text: gameName("chess") })]),
        el("div", { class: "icon-btn", text: me === "w" ? t("game.white") : t("game.black") }),
      ]),
      oppStrip,
      statusEl,
      el("div", { class: "board-wrap" }, [canvas, overlay]),
      sacrificeBar,
      skillBar,
      toast,
    ]),
  );

  const renderer = new BoardRenderer(canvas);

  function state(): MatchState {
    return session.getState();
  }
  function actor(): Color {
    const s = state();
    return s.pending ? s.pending.color : s.chess.turn;
  }
  function myTurn(): boolean {
    return state().status === "playing" && actor() === me;
  }

  // ── rendering ──────────────────────────────────────────────
  function render(): void {
    const s = state();
    let rOpts: RenderOptions;
    if (s.pending?.kind === "sacrifice" && s.pending.color === me && sacSource !== null) {
      rOpts = { selected: sacSource, targets: sacrificeDests(sacSource), lastMove: null, flipped };
    } else if (titanSelected && s.titan) {
      rOpts = { selected: null, targets: titanReach(s).map((r) => r.anchor), lastMove: null, flipped };
    } else if (targeting) {
      rOpts = { selected: targeting.picks[0] ?? null, targets: targetingHighlights(), lastMove: null, flipped };
    } else if (selected !== null) {
      rOpts = { selected, targets: legalTargets(selected), lastMove: null, flipped };
    } else {
      rOpts = { selected: null, targets: [], lastMove: null, flipped };
    }
    rOpts.titan = s.titan ? { cells: s.titan.cells, hp: s.titan.hp } : null;
    renderer.render(s.chess, rOpts);
    sacrificeBar.classList.toggle("hidden", !(s.pending?.kind === "sacrifice" && s.pending.color === me));
    renderStatus();
    renderSkillBar();
    renderOppStrip();
    if (s.status === "ended") { scheduleGameOver(); return; }
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = undefined; }
    if (gameOverUp && !opponentLeft) {
      // A rematch started: tear down the game-over card and reset its state.
      gameOverUp = false;
      rematchPending = false;
      opponentLeft = false;
      overlay.classList.add("hidden");
      overlay.replaceChildren();
    }
  }

  function renderStatus(): void {
    const s = state();
    if (s.status === "ended") return;
    if (s.titan && s.chess.turn === s.titan.owner && s.titan.owner === me) {
      statusEl.textContent = `Titan (HP ${s.titan.hp})`;
      return;
    }
    if (s.pending && s.pending.color === me) {
      const k = s.pending.kind;
      statusEl.textContent =
        k === "sacrifice" ? `Sacrifice: move a piece (${s.pending.movesLeft} left, no captures)`
        : k === "revive-place" ? "Revive: pick an empty square"
        : "King's Return: pick a revival square";
      return;
    }
    if (foresightPeek) {
      statusEl.textContent = "Foresight: click an opponent card";
      return;
    }
    if (targeting) {
      const name = skillName(targeting.skillId);
      statusEl.textContent = `${name}: pick a target (click empty space to cancel)`;
      return;
    }
    if (!myTurn()) {
      statusEl.textContent = t("game.oppTurn");
      return;
    }
    statusEl.textContent = t("game.yourTurn");
  }

  function renderSkillBar(): void {
    const deck = state().players[me].deck;
    if (deck.length === 0) {
      // Plain game (no cards): hide the bar entirely.
      skillBar.replaceChildren();
      skillBar.classList.add("hidden");
      return;
    }
    skillBar.classList.remove("hidden");
    const busy = !!targeting || foresightPeek || !!state().pending || !!state().titan;
    skillBar.replaceChildren(
      ...deck.map((c) => {
        const meta = skillById(c.id);
        let stateText: string, cls: string;
        if (meta?.type === "passive") { stateText = t("skill.alwaysOn"); cls = "passive"; }
        else if (c.usesLeft !== null && c.usesLeft <= 0) { stateText = t("skill.spent"); cls = "spent"; }
        else if (c.cooldownRemaining > 0) { stateText = `CD ${c.cooldownRemaining}`; cls = "cooldown"; }
        else { stateText = t("skill.ready"); cls = "ready"; }
        const usable = myTurn() && !busy && meta?.type === "active" && c.cooldownRemaining === 0 && (c.usesLeft === null || c.usesLeft > 0);
        const chip = el("div", { class: `skill-chip ${cls}${usable ? " usable" : ""}` }, [
          el("span", { class: "chip-icon", text: meta?.icon ?? "?" }),
          el("div", { class: "chip-body" }, [
            el("span", { class: "chip-name", text: skillName(c.id) }),
            el("span", { class: "chip-state", text: stateText }),
          ]),
        ]);
        if (usable) chip.onclick = () => activateSkill(c.id);
        return chip;
      }),
    );
  }

  function renderOppStrip(): void {
    const deck = state().players[opp].deck;
    if (deck.length === 0) { oppStrip.replaceChildren(); return; }
    const revealed = new Set(state().players[me].revealed);
    oppStrip.replaceChildren(
      el("span", { class: "opp-strip-label", text: t("game.oppSkills") }),
      ...deck.map((c, i) => {
        const shown = revealed.has(i) && c.id !== "hidden";
        const peekable = foresightPeek && !shown;
        const chip = el("div", {
          class: `opp-card${shown ? " revealed" : ""}${peekable ? " peekable" : ""}`,
          text: shown ? skillName(c.id) : "❓",
        });
        if (peekable) chip.onclick = () => { foresightPeek = false; session.dispatch({ type: "foresight", index: i }); };
        return chip;
      }),
    );
  }

  function scheduleGameOver(): void {
    if (gameOverUp || overlayTimer) return;
    overlayTimer = window.setTimeout(() => { overlayTimer = undefined; showGameOver(); }, GAME_OVER_DELAY_MS);
  }

  function showGameOver(): void {
    const s = state();
    const msg =
      s.winner === "draw" ? t("game.draw")
      : s.winner === me ? t("game.victory")
      : t("game.defeat");
    // Why it ended — checkmate, stalemate, resignation… — so a loss is legible.
    const why = s.endReason ? tPassthrough(s.endReason) : "";
    statusEl.textContent = opponentLeft
      ? `${msg} · ${t("game.oppLeft")}`
      : why ? `${msg} · ${why}` : msg;

    const actions: HTMLElement[] = [];
    if (opponentLeft) {
      actions.push(el("div", { class: "overlay-note", text: t("game.oppLeft") }));
    } else if (rematchPending) {
      actions.push(el("button", { class: "start-btn waiting", text: t("game.waitingOpp") }));
    } else {
      actions.push(el("button", {
        class: "start-btn",
        text: t("game.rematch"),
        // Show the pending state first; a local session restarts synchronously
        // inside rematch() and its fresh state will tear this overlay back down.
        onclick: () => { rematchPending = true; showGameOver(); session.rematch(); },
      }));
    }
    actions.push(el("button", { class: "back-btn", text: t("common.menu"), onclick: () => ctx.navigate(menuScreen) }));

    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: "overlay-msg", text: msg }),
        why ? el("div", { class: "overlay-why", text: why }) : null,
        el("div", { class: "overlay-actions" }, actions),
      ]),
    );
    overlay.classList.remove("hidden");
    gameOverUp = true;
  }

  /** Opponent quit before the match ended — there's no result to show. */
  function showOpponentLeft(): void {
    statusEl.textContent = t("game.oppLeft");
    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: "overlay-msg", text: t("game.oppLeft") }),
        el("div", { class: "overlay-actions" }, [
          el("button", { class: "back-btn", text: t("common.menu"), onclick: () => ctx.navigate(menuScreen) }),
        ]),
      ]),
    );
    overlay.classList.remove("hidden");
    gameOverUp = true;
  }

  // ── highlight helpers ──────────────────────────────────────
  function legalTargets(from: Square): Square[] {
    return generateLegalMoves(state().chess, from, state().rules).map((m) => m.to);
  }
  function sacrificeDests(from: Square): Square[] {
    return generateLegalMoves(state().chess, from, state().rules).filter((m) => !m.captured).map((m) => m.to);
  }
  function targetingHighlights(): Square[] {
    if (!targeting) return [];
    const id = targeting.skillId;
    if (id === "teleport") return targeting.picks;
    if (id === "phantom") {
      const from = targeting.picks[0];
      if (from === undefined) return [];
      const rules: SkillRules = { ...state().rules, phantom: { ...state().rules.phantom, [me]: true } };
      return generateLegalMoves(state().chess, from, rules).map((m) => m.to);
    }
    if (SRC_DEST.has(id)) {
      const from = targeting.picks[0];
      return from === undefined ? [] : repositionDests(id, from);
    }
    return [];
  }
  function repositionDests(id: string, from: Square): Square[] {
    const board = state().chess.board;
    const piece = board[from]!;
    const f = fileOf(from), r = rankOf(from);
    const dir = piece.color === "w" ? 1 : -1;
    const out: Square[] = [];
    const add = (nf: number, nr: number, cap: boolean) => {
      if (!onBoard(nf, nr)) return;
      const to = makeSquare(nf, nr);
      const t = board[to];
      if (!t) out.push(to);
      else if (cap && t.color !== piece.color) out.push(to);
    };
    if (id === "retreat") { add(f, r - dir, false); add(f - 1, r, false); add(f + 1, r, false); }
    else if (id === "cross-diagonal") {
      const dirs: [number, number][] = piece.type === "b"
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (const [df, dr] of dirs) add(f + df, r + dr, true);
    } else {
      for (const [df, dr] of TITAN_DIRS) add(f + df, r + dr, false);
    }
    return out;
  }
  function titanReach(s: MatchState): { anchor: Square; cells: Square[] }[] {
    const titan = s.titan!;
    const board = s.chess.board;
    const res: { anchor: Square; cells: Square[] }[] = [];
    for (const [df, dr] of TITAN_DIRS) {
      for (let d = 1; d <= 4; d++) {
        if (!titan.cells.every((sq) => onBoard(fileOf(sq) + df * d, rankOf(sq) + dr * d))) break;
        const cells = titan.cells.map((sq) => makeSquare(fileOf(sq) + df * d, rankOf(sq) + dr * d));
        if (cells.some((sq) => board[sq]?.color === titan.owner)) continue;
        res.push({ anchor: cells[0]!, cells });
      }
    }
    return res;
  }

  // ── skill activation & input ───────────────────────────────
  function activateSkill(id: string): void {
    if (targeting?.skillId === id) { targeting = null; return render(); }
    if (foresightPeek && id === "foresight") { foresightPeek = false; return render(); }
    selected = null;
    if (IMMEDIATE[id]) {
      session.dispatch({ type: IMMEDIATE[id] } as never);
    } else if (id === "foresight") {
      foresightPeek = true;
    } else {
      targeting = { skillId: id, picks: [] };
    }
    render();
  }

  function handleClick(sq: Square): void {
    const s = state();
    if (s.status === "ended" || opponentLeft) return;

    if (s.pending && s.pending.color === me) return handlePending(sq);
    if (targeting) return handleTargeting(sq);
    if (!myTurn()) return;

    if (s.titan && s.titan.owner === me) {
      if (titanSelected) {
        const dest = titanReach(s).find((r) => r.anchor === sq);
        if (dest) { titanSelected = false; return session.dispatch({ type: "titan-move", cells: dest.cells }); }
        if (s.titan.cells.includes(sq)) { titanSelected = false; return render(); }
        titanSelected = false; // fall through to normal move
      } else if (s.titan.cells.includes(sq)) {
        titanSelected = true;
        return render();
      }
    }

    handleNormalClick(sq);
  }

  function handleNormalClick(sq: Square): void {
    const board = state().chess.board;
    if (selected === null) {
      const p = board[sq];
      if (p && p.color === me && sq !== state().players[me].lockedFrom) { selected = sq; render(); }
      return;
    }
    if (sq === selected) { selected = null; return render(); }
    const p = board[sq];
    if (p && p.color === me && sq !== state().players[me].lockedFrom) { selected = sq; return render(); }
    if (legalTargets(selected).includes(sq)) {
      void dispatchMove(selected, sq, "move");
    } else {
      selected = null;
      render();
    }
  }

  async function dispatchMove(from: Square, to: Square, type: "move" | "phantom-move"): Promise<void> {
    let promotion: PieceType | undefined;
    if (isPromotion(from, to)) promotion = await pickPromotion();
    selected = null;
    targeting = null;
    session.dispatch(type === "move" ? { type: "move", from, to, promotion } : { type: "phantom-move", from, to });
    render();
  }

  function handleTargeting(sq: Square): void {
    const id = targeting!.skillId;
    const board = state().chess.board;
    const mine = board[sq]?.color === me;

    if (id === "teleport") {
      if (!mine || board[sq]!.type === "k") { targeting = null; return render(); }
      const picks = targeting!.picks;
      const idx = picks.indexOf(sq);
      if (idx >= 0) picks.splice(idx, 1); else picks.push(sq);
      if (picks.length === 2) { const [a, b] = picks; targeting = null; session.dispatch({ type: "teleport", a: a!, b: b! }); }
      return render();
    }

    if (SINGLE_TARGET.has(id)) {
      if (!mine || board[sq]!.type === "k" || (id !== "iron-guard" && board[sq]!.type === "q")) { targeting = null; return render(); }
      targeting = null;
      if (id === "iron-guard") session.dispatch({ type: "iron-guard", sq });
      else if (id === "evolve-gamble") session.dispatch({ type: "evolve", sq });
      else session.dispatch({ type: "revive", fuel: sq });
      return render();
    }

    if (id === "sacrifice-pact") {
      if (!mine || board[sq]!.type === "k") { targeting = null; return render(); }
      targeting = null;
      session.dispatch({ type: "sacrifice-start", sq });
      return render();
    }

    // source → destination (retreat / cross-diagonal / raid-march / phantom)
    if (targeting!.picks.length === 0) {
      if (mine) { targeting!.picks = [sq]; render(); } else { targeting = null; render(); }
      return;
    }
    const from = targeting!.picks[0]!;
    if (sq === from) { targeting = null; return render(); }
    const dests = id === "phantom" ? phantomDests(from) : repositionDests(id, from);
    if (dests.includes(sq)) {
      targeting = null;
      if (id === "phantom") void dispatchMove(from, sq, "phantom-move");
      else session.dispatch({ type: id, from, to: sq } as never);
      return render();
    }
    if (mine) { targeting!.picks = [sq]; render(); } else { targeting = null; render(); }
  }

  function phantomDests(from: Square): Square[] {
    const rules: SkillRules = { ...state().rules, phantom: { ...state().rules.phantom, [me]: true } };
    return generateLegalMoves(state().chess, from, rules).map((m) => m.to);
  }

  function handlePending(sq: Square): void {
    const p = state().pending!;
    const board = state().chess.board;
    if (p.kind === "revive-place" || p.kind === "kings-return") {
      if (board[sq]) return;
      session.dispatch(p.kind === "revive-place" ? { type: "revive-place", sq } : { type: "kings-return-place", sq });
      return;
    }
    // sacrifice
    if (sacSource === null) {
      if (board[sq]?.color === me && !p.moved.includes(sq)) { sacSource = sq; render(); }
      return;
    }
    if (sq === sacSource) { sacSource = null; return render(); }
    if (sacrificeDests(sacSource).includes(sq)) {
      const from = sacSource;
      sacSource = null;
      session.dispatch({ type: "sacrifice-move", from, to: sq });
      return;
    }
    if (board[sq]?.color === me && !p.moved.includes(sq)) { sacSource = sq; render(); }
    else { sacSource = null; render(); }
  }

  function isPromotion(from: Square, to: Square): boolean {
    return generateLegalMoves(state().chess, from, state().rules).some((m) => m.to === to && !!m.promotion);
  }

  function pickPromotion(): Promise<PieceType> {
    return new Promise((resolve) => {
      const glyphs: Record<string, string> = me === "w"
        ? { q: "♕", r: "♖", b: "♗", n: "♘" } : { q: "♛", r: "♜", b: "♝", n: "♞" };
      overlay.replaceChildren(
        el("div", { class: "promo-overlay" },
          (["q", "r", "b", "n"] as PieceType[]).map((t) =>
            el("button", { class: "promo-btn", text: glyphs[t], onclick: () => { overlay.classList.add("hidden"); overlay.replaceChildren(); resolve(t); } }),
          ),
        ),
      );
      overlay.classList.remove("hidden");
    });
  }

  // ── wire up ────────────────────────────────────────────────
  let toastTimer: number | undefined;
  function showToast(text: string): void {
    toast.textContent = text;
    toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 1600);
  }

  session.subscribe((_s, events) => {
    for (const e of events) if (e.type === "toast") showToast(e.text);
    // Reset local targeting if the turn/pending situation changed under us.
    if (!myTurn()) { selected = null; targeting = null; }
    render();
  });

  session.onNotice((notice) => {
    if (notice === "rematch-waiting") {
      rematchPending = true;
      if (gameOverUp) showGameOver();
    } else if (notice === "opponent-left") {
      opponentLeft = true;
      if (state().status === "ended") showGameOver();
      else showOpponentLeft();
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    handleClick(renderer.squareFromPixel(x, y, flipped));
  });

  render();
  // Sprites may still be decoding on a cold load; repaint once they land.
  void preloadPieces().then(render);

  return () => { if (overlayTimer) clearTimeout(overlayTimer); session.dispose(); };
}
