import type { Player } from "@skill/games";
import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "../screens/menu.js";
import { gameById } from "../games.js";
import { createLocalBoardSession, type BoardSession } from "./session.js";
import { getView, preloadBoardArt, type BoardView } from "./views.js";
import { getAI } from "./ai.js";
import type { LevelDef } from "../difficulty.js";
import { gameName, t, tPassthrough } from "../i18n.js";

/** How long the final position stays visible before the result card covers it. */
const GAME_OVER_DELAY_MS = 1100;

/** Single-player entry for a board game: local session + AI, shared view. */
export function makeLocalBoardGame(gameId: string, human: Player, level: LevelDef): Screen {
  return (ctx) => {
    const view = getView(gameId, human);
    if (!view) return ctx.navigate(menuScreen);
    const session = createLocalBoardSession(view.mod, getAI(gameId, level), human);
    return mountBoardGame(ctx, gameId, session, view, () => ctx.navigate(menuScreen));
  };
}

/**
 * The shared board-game screen. Renders the view's board, turns clicks into
 * moves, and shows the game-over / rematch overlay. Works identically for a
 * local AI session and an online (server) session — same as chess mountGame.
 */
export function mountBoardGame(
  ctx: AppContext,
  gameId: string,
  session: BoardSession<unknown, unknown>,
  view: BoardView,
  onExit: () => void,
): () => void {
  const me = session.myPlayer;
  const mod = view.mod;
  const game = gameById(gameId);

  let gameOverUp = false;
  let rematchPending = false;
  let opponentLeft = false;
  // The overlay covers the board, so it waits a beat — otherwise the winning
  // move is hidden behind the result card the instant it is played.
  let overlayTimer: number | undefined;

  const canvas = el("canvas", { class: "board-canvas" }) as HTMLCanvasElement;
  canvas.width = 640;
  canvas.height = 640;
  const statusEl = el("div", { class: "game-status" });
  const overlay = el("div", { class: "game-overlay hidden" });

  /**
   * A player's strip above / below the board: who they are, what their pieces
   * look like, and a per-game line (stones placed, pieces captured, walls left).
   * The strip for whoever is to move is highlighted, so the board itself doesn't
   * have to carry the turn indicator.
   */
  const opp: Player = me === "b" ? "w" : "b";
  function playerBar(who: Player, label: string): { node: HTMLElement; info: HTMLElement } {
    const dot = el("span", { class: "pb-dot" });
    dot.style.background = view.swatch?.(who) ?? "#8a6a2e";
    const info = el("span", { class: "pb-info" });
    const node = el("div", { class: "player-bar glass" }, [
      dot,
      el("span", { class: "pb-name", text: label }),
      info,
      el("span", { class: "pb-turn", text: t("game.toMove") }),
    ]);
    return { node, info };
  }
  const oppBar = playerBar(opp, t("game.opponent"));
  const myBar = playerBar(me, t("game.you"));

  ctx.root.appendChild(
    el("div", { class: "screen chess-screen board-screen" }, [
      el("div", { class: "game-topbar" }, [
        el("button", { class: "back-btn", text: t("common.leave"), onclick: onExit }),
        el("div", { class: "game-heading" }, [el("span", { text: game ? gameName(game.id) : gameId })]),
        el("div", { class: "icon-btn", text: me === "b" ? t("game.first") : t("game.second") }),
      ]),
      oppBar.node,
      el("div", { class: "board-wrap" }, [canvas, overlay]),
      myBar.node,
      statusEl,
      view.controls ?? el("div"),
    ]),
  );

  const g = canvas.getContext("2d");
  if (!g) throw new Error("2D canvas context unavailable");

  function state(): unknown {
    return session.getState();
  }

  function renderBars(s: unknown, activeTurn: Player | null): void {
    for (const [who, bar] of [[opp, oppBar], [me, myBar]] as const) {
      bar.info.textContent = view.info?.(s, who) ?? "";
      bar.node.classList.toggle("active", activeTurn === who);
    }
  }

  function render(): void {
    const s = state();
    view.draw(g!, canvas.width, s);
    const res = mod.result(s);
    if (res.done) { renderBars(s, null); scheduleGameOver(); return; }
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = undefined; }
    if (gameOverUp && !opponentLeft) { gameOverUp = false; rematchPending = false; overlay.classList.add("hidden"); overlay.replaceChildren(); }
    const turn = mod.turn(s);
    renderBars(s, turn);
    statusEl.textContent = turn === me ? t("game.yourTurn") : t("game.oppTurn");
  }

  function scheduleGameOver(): void {
    if (gameOverUp || overlayTimer) return;
    overlayTimer = window.setTimeout(() => { overlayTimer = undefined; showGameOver(); }, GAME_OVER_DELAY_MS);
  }

  function showGameOver(): void {
    const res = mod.result(state());
    const msg = res.winner === "draw" ? t("game.draw") : res.winner === me ? t("game.victory") : t("game.defeat");
    statusEl.textContent = opponentLeft ? `${msg} · ${t("game.oppLeft")}` : `${msg}${res.reason ? ` · ${tPassthrough(res.reason)}` : ""}`;

    const actions: HTMLElement[] = [];
    if (opponentLeft) {
      actions.push(el("div", { class: "overlay-note", text: t("game.oppLeft") }));
    } else if (rematchPending) {
      actions.push(el("button", { class: "start-btn waiting", text: t("game.waitingOpp") }));
    } else {
      actions.push(el("button", {
        class: "start-btn",
        text: t("game.rematch"),
        onclick: () => { rematchPending = true; showGameOver(); session.rematch(); },
      }));
    }
    actions.push(el("button", { class: "back-btn", text: t("common.menu"), onclick: () => ctx.navigate(menuScreen) }));

    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: "overlay-msg", text: msg }),
        el("div", { class: "overlay-actions" }, actions),
      ]),
    );
    overlay.classList.remove("hidden");
    gameOverUp = true;
  }

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

  view.setRerender(render);
  session.subscribe(() => render());
  session.onNotice((notice) => {
    if (notice === "rematch-waiting") { rematchPending = true; if (gameOverUp) showGameOver(); }
    else if (notice === "opponent-left") { opponentLeft = true; if (mod.result(state()).done) showGameOver(); else showOpponentLeft(); }
  });

  const toCanvas = (e: MouseEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height)];
  };

  canvas.addEventListener("click", (e) => {
    if (mod.result(state()).done || opponentLeft) return;
    if (mod.turn(state()) !== me) return; // not your turn
    const [cx, cy] = toCanvas(e);
    const move = view.click(state(), cx, cy, canvas.width);
    if (move != null) session.dispatch(move);
  });

  if (view.hover) {
    canvas.addEventListener("mousemove", (e) => {
      if (mod.result(state()).done) return;
      const [cx, cy] = toCanvas(e);
      view.hover!(state(), cx, cy, canvas.width);
    });
    canvas.addEventListener("mouseleave", () => view.hover!(state(), -1, -1, canvas.width));
  }

  render();
  // Repaint once the piece art lands; the first frame may draw before it decodes.
  void preloadBoardArt().then(render);

  return () => { if (overlayTimer) clearTimeout(overlayTimer); session.dispose(); };
}
