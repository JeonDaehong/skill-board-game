import type { Player } from "@skill/games";
import { el, type AppContext, type Screen } from "../router.js";
import { gameName, getLang, t } from "../i18n.js";
import { LADDERS, getLevelIndex, setLevelIndex, type GameId } from "../difficulty.js";
import { art, pieceUrl } from "../ui/art.js";
import {
  TIME_CONTROLS, getTimeControlId, isUntimed, setTimeControlId, timeControlById, type TimeControl,
} from "../clock.js";

/**
 * Pre-match setup for a single-player game: pick the AI's rung, pick your side,
 * start. Both choices live on one screen because they are the same decision —
 * "how hard do I want this to be" — and splitting them would put two menus
 * between the picker and the board.
 *
 * Multiplayer will reuse the side control, but there the lower-rated player
 * chooses, so it is not wired in here.
 */
export interface SideOption {
  value: Player;
  /** `[en, ko]`, matching the ordering the rest of i18n.ts uses. */
  label: readonly [en: string, ko: string];
  /** Colour of the option's swatch dot. */
  swatch: string;
  /** True for the side that opens the game. */
  first: boolean;
}

/**
 * Each game names its own sides, listed in play order. Which engine colour each
 * name maps to is fixed by the rules module: janggi's 초 is "b" and opens, and
 * omok's 흑 is "b" and opens, while chess opens with "w".
 */
const SIDES: Record<GameId, SideOption[]> = {
  chess: [
    { value: "w", label: ["White", "백"], swatch: "#efe4cb", first: true },
    { value: "b", label: ["Black", "흑"], swatch: "#241a12", first: false },
  ],
  janggi: [
    // Matches JANGGI_SIDE in board/views.ts — cool-dark 초, warm-pale 한.
    { value: "b", label: ["Cho", "초"], swatch: "#456b85", first: true },
    { value: "w", label: ["Han", "한"], swatch: "#c39a6a", first: false },
  ],
  omok: [
    { value: "b", label: ["Black", "흑"], swatch: "#140d08", first: true },
    { value: "w", label: ["White", "백"], swatch: "#efe4cb", first: false },
  ],
};

export const sidesFor = (id: GameId): SideOption[] => SIDES[id];

const pick = (label: readonly [string, string]) => (getLang() === "ko" ? label[1] : label[0]);

/**
 * Every ladder is named after that game's own pieces, so each rung can simply
 * show the piece. Reading a row of pawn→king is faster than reading six words,
 * and it says "this is a chess ladder" without a label.
 *
 * Gomoku is stones all the way up and has nothing to show, so it falls back to
 * the plain chip — hence the lookups below are allowed to miss.
 */
const RUNG_ART: Partial<Record<GameId, Record<string, string>>> = {
  chess: { pawn: "wp", rook: "wr", bishop: "wb", knight: "wn", queen: "wq", king: "wk" },
};
/** Janggi pieces live in their own sheet, not the chess one. */
const JANGGI_RUNG_ART: Record<string, string> = {
  soldier: "ws", horse: "wh", elephant: "we", chariot: "wr", general: "wk",
};

function rungArtUrl(gameId: GameId, key: string): string | null {
  if (gameId === "janggi") {
    const code = JANGGI_RUNG_ART[key];
    return code ? `/assets/janggi/${code}.png` : null;
  }
  const code = RUNG_ART[gameId]?.[key];
  return code ? pieceUrl(code) : null;
}

/** A tile's fine print: what the notation expands to in plain minutes. */
function clockSub(tc: TimeControl): string {
  if (isUntimed(tc)) return t("clock.subUntimed");
  const mins = String(Math.round(tc.mainMs / 60_000));
  if (tc.stepMs === 0) return t("clock.subMain").replace("{min}", mins);
  const secs = String(tc.stepMs / 1000);
  return (tc.mode === "byoyomi" ? t("clock.subByoyomi") : t("clock.subIncrement"))
    .replace("{min}", mins)
    .replace("{sec}", secs);
}

/** The side tiles show that side's king, which is the piece both games crown. */
function sideArtUrl(gameId: GameId, value: Player): string | null {
  if (gameId === "janggi") return `/assets/janggi/${value}k.png`;
  if (gameId === "chess") return pieceUrl(`${value}k`);
  return null;
}

/**
 * Build the setup screen for `gameId`. `start` receives the chosen side and the
 * ladder index; the caller decides which controller to mount.
 */
export function makeSetup(
  gameId: GameId,
  start: (side: Player, levelIndex: number, control: TimeControl) => Screen,
  onBack: Screen,
): Screen {
  return (ctx: AppContext) => {
    const ladder = LADDERS[gameId];
    const sides = SIDES[gameId];
    let levelIndex = getLevelIndex(gameId);
    let side: Player = sides[0]!.value;
    let control = timeControlById(getTimeControlId());

    const levelRow = el("div", { class: "rung-grid" });
    const sideRow = el("div", { class: "side-grid" });
    const clockRow = el("div", { class: "clock-grid" });
    const levelNote = el("p", { class: "setup-note" });
    const clockNote = el("p", { class: "setup-note clock-note" });

    function renderLevels(): void {
      levelRow.replaceChildren(
        ...ladder.map((lv, i) => {
          const url = rungArtUrl(gameId, lv.key);
          return el(
            "button",
            {
              class: `rung-tile rung-${i}${i === levelIndex ? " active" : ""}`,
              onclick: () => {
                if (i === levelIndex) return;
                levelIndex = i;
                setLevelIndex(gameId, i);
                renderLevels();
              },
            },
            [
              url
                ? art(url, "rung-art")
                : el("span", { class: "rung-dot", text: String(i + 1) }),
              el("span", { class: "rung-name", text: pick(lv.label) }),
              // A filled pip per rung below this one: the ladder reads as a
              // ladder even before you know what a "Bishop" AI plays like.
              el("span", { class: "rung-meter" },
                ladder.map((_, j) => el("i", { class: j <= i ? "on" : "" })),
              ),
            ],
          );
        }),
      );
      // Both numbers are caps, and which one actually binds depends on the rung:
      // the shallow ones finish in milliseconds and never touch their clock,
      // while the deep ones run out of time long before their depth limit. So
      // the note shows both rather than claiming a "thinking time" that the
      // bottom of the ladder never spends.
      const lv = ladder[levelIndex]!;
      levelNote.textContent = `${t("setup.depth")} ${lv.maxDepth} · ${t("setup.think")} ${(lv.timeMs / 1000).toFixed(1)}s`;
    }

    function renderSides(): void {
      sideRow.replaceChildren(
        ...sides.map((opt) => {
          const url = sideArtUrl(gameId, opt.value);
          const dot = el("span", { class: "setup-swatch" });
          dot.style.background = opt.swatch;
          return el(
            "button",
            {
              class: `side-tile${opt.value === side ? " active" : ""}`,
              onclick: () => {
                if (opt.value === side) return;
                side = opt.value;
                renderSides();
              },
            },
            [
              url ? art(url, "side-art") : dot,
              el("span", { class: "side-name", text: pick(opt.label) }),
              el("span", { class: "side-order", text: opt.first ? t("setup.first") : t("setup.second") }),
            ],
          );
        }),
      );
    }

    function renderClocks(): void {
      clockRow.replaceChildren(
        ...TIME_CONTROLS.map((tc) =>
          el(
            "button",
            {
              class: `clock-tile${tc.id === control.id ? " active" : ""}${isUntimed(tc) ? " untimed" : ""}`,
              onclick: () => {
                if (tc.id === control.id) return;
                control = tc;
                setTimeControlId(tc.id);
                renderClocks();
              },
            },
            [
              // The notation leads, because "15+10" is the thing a player
              // recognises; the bracket name is the caption under it.
              el("span", { class: "clock-short", text: tc.short }),
              el("span", { class: "clock-name", text: pick(tc.name) }),
              el("span", { class: "clock-sub", text: clockSub(tc) }),
            ],
          ),
        ),
      );
      // Spell out what the "+N" half actually does, since increment and
      // byoyomi share that notation and mean opposite things once the main
      // clock is gone.
      clockNote.className = `setup-note clock-note${control.mode === "byoyomi" ? " byoyomi" : ""}`;
      clockNote.textContent =
        control.stepMs === 0
          ? control.mainMs === 0 ? t("clock.noteUntimed") : t("clock.noteSudden")
          // replaceAll, not replace: the increment note names the step twice.
          : control.mode === "increment"
            ? t("clock.noteIncrement").replaceAll("{step}", String(control.stepMs / 1000))
            : t("clock.noteByoyomi").replaceAll("{step}", String(control.stepMs / 1000));
    }

    renderLevels();
    renderSides();
    renderClocks();

    // Two columns on a wide screen: the opponent (who you play and as what) on
    // the left, the clock on the right. Stacks to one column on narrow ones.
    ctx.root.appendChild(
      el("div", { class: "screen setup-screen" }, [
        el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(onBack) }),
        el("h1", { class: "screen-title", text: gameName(gameId) }),
        el("div", { class: "glass setup-panel" }, [
          el("div", { class: "setup-cols" }, [
            el("div", { class: "setup-col" }, [
              el("section", { class: "setup-block" }, [
                el("h2", { class: "setup-label", text: t("setup.difficulty") }),
                levelRow,
                levelNote,
              ]),
              el("section", { class: "setup-block" }, [
                el("h2", { class: "setup-label", text: t("setup.side") }),
                sideRow,
              ]),
            ]),
            el("div", { class: "setup-col" }, [
              el("section", { class: "setup-block" }, [
                el("h2", { class: "setup-label", text: t("setup.clock") }),
                clockRow,
                clockNote,
              ]),
            ]),
          ]),
          el("button", {
            class: "btn btn-primary setup-start",
            text: t("setup.start"),
            onclick: () => ctx.navigate(start(side, levelIndex, control)),
          }),
        ]),
      ]),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.navigate(onBack);
      else if (e.key === "Enter") ctx.navigate(start(side, levelIndex, control));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  };
}
