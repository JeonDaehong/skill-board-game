import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "../screens/menu.js";
import { gameById } from "../games.js";
import { createLocalBoardSession, type BoardSession } from "./session.js";
import { getView, type BoardView } from "./views.js";
import { getAI } from "./ai.js";

/** Single-player entry for a board game: local session + AI, shared view. */
export function makeLocalBoardGame(gameId: string): Screen {
  return (ctx) => {
    const view = getView(gameId, "b");
    if (!view) return ctx.navigate(menuScreen);
    const session = createLocalBoardSession(view.mod, getAI(gameId), "b");
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

  const canvas = el("canvas", { class: "board-canvas" }) as HTMLCanvasElement;
  canvas.width = 640;
  canvas.height = 640;
  const statusEl = el("div", { class: "game-status" });
  const overlay = el("div", { class: "game-overlay hidden" });

  ctx.root.appendChild(
    el("div", { class: "screen chess-screen" }, [
      el("div", { class: "game-topbar" }, [
        el("button", { class: "back-btn", text: "← 나가기", onclick: onExit }),
        el("div", { class: "game-heading" }, [el("span", { text: game?.name ?? gameId })]),
        el("div", { class: "icon-btn", text: me === "b" ? "선공" : "후공" }),
      ]),
      statusEl,
      el("div", { class: "board-wrap" }, [canvas, overlay]),
      view.controls ?? el("div"),
    ]),
  );

  const g = canvas.getContext("2d");
  if (!g) throw new Error("2D canvas context unavailable");

  function state(): unknown {
    return session.getState();
  }

  function render(): void {
    const s = state();
    view.draw(g!, canvas.width, s);
    const res = mod.result(s);
    if (res.done) { showGameOver(); return; }
    if (gameOverUp && !opponentLeft) { gameOverUp = false; rematchPending = false; overlay.classList.add("hidden"); overlay.replaceChildren(); }
    statusEl.textContent = mod.turn(s) === me ? "당신 차례" : "상대 차례…";
  }

  function showGameOver(): void {
    const res = mod.result(state());
    const msg = res.winner === "draw" ? "무승부" : res.winner === me ? "승리! 🎉" : "패배";
    statusEl.textContent = opponentLeft ? `${msg} · 상대가 나갔습니다` : `${msg}${res.reason ? ` · ${res.reason}` : ""}`;

    const actions: HTMLElement[] = [];
    if (opponentLeft) {
      actions.push(el("div", { class: "overlay-note", text: "상대가 나갔습니다" }));
    } else if (rematchPending) {
      actions.push(el("button", { class: "start-btn waiting", text: "상대 대기 중…" }));
    } else {
      actions.push(el("button", {
        class: "start-btn",
        text: "다시하기",
        onclick: () => { rematchPending = true; showGameOver(); session.rematch(); },
      }));
    }
    actions.push(el("button", { class: "back-btn", text: "메뉴로", onclick: () => ctx.navigate(menuScreen) }));

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
    statusEl.textContent = "상대가 나갔습니다";
    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: "overlay-msg", text: "상대가 나갔습니다" }),
        el("div", { class: "overlay-actions" }, [
          el("button", { class: "back-btn", text: "메뉴로", onclick: () => ctx.navigate(menuScreen) }),
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
  return () => session.dispose();
}
