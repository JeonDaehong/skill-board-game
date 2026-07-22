import { el, type AppContext, type Screen } from "../router.js";
import { makeGamePicker } from "./select.js";
import { makeQuickLobby } from "./lobby.js";
import { createRoomScreen } from "./create-room.js";
import { joinRoomScreen } from "./join-room.js";
import { menuScreen } from "./menu.js";

/** Multi Play hub: 퀵스타트 / 방 만들기 / 참여하기. */
export const multiScreen: Screen = (ctx: AppContext) => {
  const card = (icon: string, label: string, sub: string, onclick: () => void) =>
    el("button", { class: "glass mode-card", onclick }, [
      el("div", { class: "mode-icon", text: icon }),
      el("div", { class: "mode-body" }, [
        el("span", { class: "mode-label", text: label }),
        el("span", { class: "mode-sub", text: sub }),
      ]),
      el("span", { class: "mode-arrow", text: "›" }),
    ]);

  ctx.root.appendChild(
    el("div", { class: "screen multi-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: "← 뒤로", onclick: () => ctx.navigate(menuScreen) }),
      el("h1", { class: "screen-title", text: "온라인 대전" }),
      el("div", { class: "mode-list" }, [
        card("⚡", "퀵스타트", "게임을 고르면 바로 매칭", () =>
          ctx.navigate(
            makeGamePicker((game) => makeQuickLobby(game.id), {
              title: "퀵스타트 — 게임 선택",
              onBack: multiScreen,
            }),
          ),
        ),
        card("＋", "방 만들기", "방 제목·비밀번호·게임 설정 후 초대코드 생성", () =>
          ctx.navigate(createRoomScreen),
        ),
        card("🔍", "참여하기", "열린 방을 찾거나 초대코드로 입장", () =>
          ctx.navigate(joinRoomScreen),
        ),
      ]),
    ]),
  );
};
