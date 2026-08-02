import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { art, icon, objectUrl } from "../ui/art.js";
import { gameName, t } from "../i18n.js";

const NICK_KEY = "skill-board:nickname";

/** Profile: nickname (persisted locally) + placeholder rank / record / history. */
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

  const historyRow = (game: string, title: string, result: string, win: boolean) =>
    el("div", { class: "glass history-row" }, [
      art(objectUrl(game), "history-icon"),
      el("span", { class: "history-title", text: title }),
      el("span", { class: `history-result ${win ? "win" : "loss"}`, text: result }),
    ]);

  let editing = false;
  const editBtn = el("button", { class: "btn btn-ghost btn-small", text: t("profile.edit") });
  const editRow = el("div", { class: "edit-row hidden" }, [
    nameInput,
    el("button", {
      class: "btn btn-primary btn-small",
      text: t("common.save"),
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
    editBtn.textContent = on ? t("profile.cancelEdit") : t("profile.edit");
  }

  ctx.root.appendChild(
    el("div", { class: "screen tab-screen profile-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("h1", { class: "screen-title", text: t("profile.title") }),
        el("div", { class: "glass profile-hero" }, [
          icon("avatar", "avatar"),
          el("div", { class: "profile-id" }, [
            nameEl,
            el("div", { class: "profile-tag", text: t("profile.newPlayer") }),
          ]),
          editBtn,
        ]),
        editRow,
        el("div", { class: "stat-grid" }, [
          stat(t("profile.rank"), t("profile.unranked"), true),
          stat(t("profile.wins"), "0"),
          stat(t("profile.losses"), "0"),
          stat(t("profile.winRate"), "—"),
        ]),
        el("h3", { class: "section-title", text: t("profile.recent") }),
        el("div", { class: "history-list" }, [
          historyRow("chess", `${gameName("chess")} · ${t("multi.quick")}`, t("profile.noRecords"), true),
        ]),
        el("div", { class: "coming-note", text: t("profile.soon") }),
      ]),
      pillNav(ctx, "profile"),
    ]),
  );
};
