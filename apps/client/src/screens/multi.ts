import { el, type AppContext, type Screen } from "../router.js";
import { makeGamePicker } from "./select.js";
import { makeQuickLobby } from "./lobby.js";
import { createRoomScreen } from "./create-room.js";
import { joinRoomScreen } from "./join-room.js";
import { menuScreen } from "./menu.js";
import { makeModeSelect } from "./mode-select.js";
import { icon, type IconName } from "../ui/art.js";
import { t } from "../i18n.js";

/**
 * Pick a game to queue for. Chess takes a detour through mode select first: the
 * queue is per mode, so the intent has to name one before we can join it.
 */
const quickPicker = (): Screen =>
  makeGamePicker(
    (game) =>
      game.id === "chess"
        ? makeModeSelect((mode) => makeQuickLobby(game.id, mode), quickPicker())
        : makeQuickLobby(game.id),
    { title: t("picker.title"), onBack: multiScreen },
  );

/** Multi Play hub: Quick Match / Create Room / Join Room. */
export const multiScreen: Screen = (ctx: AppContext) => {
  const card = (name: IconName, label: string, onclick: () => void) =>
    el("button", { class: "glass mode-card", onclick }, [
      icon(name, "mode-icon"),
      el("span", { class: "mode-label", text: label }),
      el("span", { class: "mode-arrow", text: "›" }),
    ]);

  ctx.root.appendChild(
    el("div", { class: "screen multi-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(menuScreen) }),
      el("h1", { class: "screen-title", text: t("multi.title") }),
      el("div", { class: "mode-list" }, [
        card("quick-match", t("multi.quick"), () => ctx.navigate(quickPicker())),
        card("create-room", t("multi.create"), () => ctx.navigate(createRoomScreen)),
        card("join-room", t("multi.join"), () => ctx.navigate(joinRoomScreen)),
      ]),
    ]),
  );
};
