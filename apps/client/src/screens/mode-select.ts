import { GAME_MODES, modeRules, type GameMode } from "@skill/engine";
import { el, type AppContext, type Screen } from "../router.js";
import { deckReady, deckTotal, loadDeck } from "../decks.js";
import { art, modeUrl } from "../ui/art.js";
import { modeDesc, modeName, modeTagline, t } from "../i18n.js";
import { makeDeckScreen } from "./deck.js";

/**
 * Which of the three chess modes to play. It sits between picking Chess and the
 * usual difficulty/side/clock setup, because the mode decides the board size
 * and which deck the match will be played with — everything downstream depends
 * on it.
 *
 * A mode whose deck is not finished is shown but cannot be started: the tile
 * says how many cards are missing and offers a shortcut into the builder,
 * which is far more useful than a disabled button with no explanation.
 */
export function makeModeSelect(
  resolve: (mode: GameMode) => Screen,
  onBack: Screen,
): Screen {
  return (ctx: AppContext) => {
    let current: GameMode = "classic";

    const tiles = el("div", { class: "mode-grid" });
    const detail = el("div", { class: "glass mode-detail" });

    ctx.root.appendChild(
      el("div", { class: "screen mode-screen" }, [
        el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(onBack) }),
        el("h1", { class: "screen-title", text: t("mode.title") }),
        el("p", { class: "screen-sub", text: t("mode.hint") }),
        tiles,
        detail,
      ]),
    );

    render();

    function statusOf(mode: GameMode): { ready: boolean; have: number; want: number } {
      const want = modeRules(mode).deckSize;
      if (want === 0) return { ready: true, have: 0, want: 0 };
      const deck = loadDeck(mode);
      return { ready: deckReady(mode, deck), have: deckTotal(deck), want };
    }

    function render(): void {
      tiles.replaceChildren(
        ...GAME_MODES.map((mode) => {
          const { ready, have, want } = statusOf(mode);
          const tile = el(
            "button",
            {
              class: `mode-tile mode-${mode}${mode === current ? " active" : ""}${ready ? "" : " unready"}`,
              onclick: () => {
                if (mode === current) return start();
                current = mode;
                render();
              },
            },
            [
              art(modeUrl(mode), "mode-art"),
              el("span", { class: "mode-name", text: modeName(mode) }),
              el("span", { class: "mode-tag", text: modeTagline(mode) }),
              el("span", { class: "mode-chips" }, [
                el("span", { class: "mode-chip", text: `${modeRules(mode).dims.width}×${modeRules(mode).dims.height}` }),
                el("span", {
                  class: `mode-chip${want === 0 ? "" : ready ? " ok" : " warn"}`,
                  text: want === 0 ? t("mode.noDeck") : `${have}/${want}`,
                }),
              ]),
            ],
          );
          return tile;
        }),
      );
      renderDetail();
    }

    function renderDetail(): void {
      const { ready, have, want } = statusOf(current);
      const actions: (Node | null)[] = [];

      if (ready) {
        actions.push(
          el("button", { class: "btn btn-primary", text: t("setup.start"), onclick: () => start() }),
        );
      } else {
        actions.push(
          el("div", {
            class: "mode-warn",
            text: t("mode.deckShort")
              .replace("{mode}", modeName(current))
              .replace("{want}", String(want))
              .replace("{have}", String(have)),
          }),
          el("button", {
            class: "btn btn-primary",
            text: t("mode.buildDeck"),
            // Straight into the builder on the right tab, then back here.
            onclick: () => ctx.navigate(makeDeckScreen(current, modeSelf)),
          }),
        );
      }

      detail.replaceChildren(
        el("h2", { class: "mode-detail-name", text: modeName(current) }),
        el("p", { class: "mode-detail-desc", text: modeDesc(current) }),
        el("div", { class: "mode-actions" }, actions),
      );
    }

    function start(): void {
      if (!statusOf(current).ready) return renderDetail();
      ctx.navigate(resolve(current));
    }

    /** This screen, so the deck builder can come back to exactly here. */
    const modeSelf: Screen = makeModeSelect(resolve, onBack);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return ctx.navigate(onBack);
      if (e.key === "Enter") return start();
      const i = GAME_MODES.indexOf(current);
      if (e.key === "ArrowLeft") {
        current = GAME_MODES[(i - 1 + GAME_MODES.length) % GAME_MODES.length]!;
        render();
      } else if (e.key === "ArrowRight") {
        current = GAME_MODES[(i + 1) % GAME_MODES.length]!;
        render();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  };
}
