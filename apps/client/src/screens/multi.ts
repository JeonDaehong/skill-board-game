import { el, type AppContext, type Screen } from "../router.js";
import { makeGamePicker } from "./select.js";
import { makeQuickLobby } from "./lobby.js";
import { createRoomScreen } from "./create-room.js";
import { joinRoomScreen } from "./join-room.js";
import { menuScreen } from "./menu.js";
import { makeModeSelect } from "./mode-select.js";
import { icon, type IconName } from "../ui/art.js";
import { getLang, t } from "../i18n.js";
import { queueControl, timeControlLabel, type QueueKind } from "../clock.js";

/**
 * Pick a game to queue for. Chess takes a detour through mode select first: the
 * queue is per mode, so the intent has to name one before we can join it.
 */
const quickPicker = (kind: QueueKind): Screen =>
  makeGamePicker(
    (game) =>
      game.id === "chess"
        ? makeModeSelect((mode) => makeQuickLobby(game.id, mode, kind), quickPicker(kind))
        : makeQuickLobby(game.id, "classic", kind),
    { title: t("picker.title"), onBack: multiScreen },
  );

/** Multi Play hub: Quick Match (casual / ranked), Create Room, Join Room. */
export const multiScreen: Screen = (ctx: AppContext) => {
  const card = (name: IconName, label: string, onclick: () => void, note?: string, extra = "") =>
    el("button", { class: `glass mode-card ${extra}`.trim(), onclick }, [
      icon(name, "mode-icon"),
      el("div", { class: "mode-label-col" }, [
        el("span", { class: "mode-label", text: label }),
        // The clock is part of what you are choosing between, so it is on the
        // button rather than a surprise on the lobby screen behind it.
        note ? el("span", { class: "mode-note", text: note }) : null,
      ]),
      el("span", { class: "mode-arrow", text: "›" }),
    ]);

  const ko = getLang() === "ko";
  const clockNote = (kind: QueueKind) => timeControlLabel(queueControl(kind), ko);

  ctx.root.appendChild(
    el("div", { class: "screen multi-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(menuScreen) }),
      el("h1", { class: "screen-title", text: t("multi.title") }),
      el("div", { class: "mode-list" }, [
        card("quick-match", t("multi.quickNormal"), () => ctx.navigate(quickPicker("normal")), clockNote("normal")),
        card("quick-match", t("multi.quickRanked"), () => ctx.navigate(quickPicker("ranked")), clockNote("ranked"), "ranked"),
        card("create-room", t("multi.create"), () => ctx.navigate(createRoomScreen)),
        card("join-room", t("multi.join"), () => ctx.navigate(joinRoomScreen)),
      ]),
    ]),
  );
};
