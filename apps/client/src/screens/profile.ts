import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";

const NICK_KEY = "skill-board:nickname";

/** 내 정보: nickname (persisted locally) + placeholder rank / record / history. */
export const profileScreen: Screen = (ctx: AppContext) => {
  const nickname = localStorage.getItem(NICK_KEY) || "Player";

  const nameEl = el("h2", { class: "profile-name", text: nickname });
  const nameInput = el("input", { class: "field-input" }) as HTMLInputElement;
  nameInput.value = nickname;
  nameInput.maxLength = 16;

  const stat = (label: string, value: string, accent = false) =>
    el("div", { class: `glass stat-tile${accent ? " accent" : ""}` }, [
      el("div", { class: "stat-value", text: value }),
      el("div", { class: "stat-label", text: label }),
    ]);

  const historyRow = (icon: string, title: string, result: string, win: boolean) =>
    el("div", { class: "glass history-row" }, [
      el("span", { class: "history-icon", text: icon }),
      el("span", { class: "history-title", text: title }),
      el("span", { class: `history-result ${win ? "win" : "loss"}`, text: result }),
    ]);

  let editing = false;
  const editBtn = el("button", { class: "btn btn-ghost btn-small", text: "닉네임 수정" });
  const editRow = el("div", { class: "edit-row hidden" }, [
    nameInput,
    el("button", {
      class: "btn btn-primary btn-small",
      text: "저장",
      onclick: () => {
        const v = nameInput.value.trim() || "Player";
        localStorage.setItem(NICK_KEY, v);
        nameEl.textContent = v;
        toggleEdit(false);
      },
    }),
  ]);
  editBtn.onclick = () => toggleEdit(!editing);
  function toggleEdit(on: boolean): void {
    editing = on;
    editRow.classList.toggle("hidden", !on);
    editBtn.textContent = on ? "취소" : "닉네임 수정";
  }

  ctx.root.appendChild(
    el("div", { class: "screen tab-screen profile-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("h1", { class: "screen-title", text: "내 정보" }),
        el("div", { class: "glass profile-hero" }, [
          el("div", { class: "avatar", text: "🐺" }),
          el("div", { class: "profile-id" }, [
            nameEl,
            el("div", { class: "profile-tag", text: "Lv.1 · 신규 플레이어" }),
          ]),
          editBtn,
        ]),
        editRow,
        el("div", { class: "stat-grid" }, [
          stat("랭크", "Unranked", true),
          stat("승", "0"),
          stat("패", "0"),
          stat("승률", "—"),
        ]),
        el("h3", { class: "section-title", text: "최근 대전" }),
        el("div", { class: "history-list" }, [
          historyRow("♞", "체스 · 빠른 대전", "기록 없음", true),
        ]),
        el("div", { class: "coming-note", text: "전적·랭킹 시스템은 준비 중입니다." }),
      ]),
      pillNav(ctx, "profile"),
    ]),
  );
};
