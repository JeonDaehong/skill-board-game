import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { art, icon, objectUrl } from "../ui/art.js";

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
  const editBtn = el("button", { class: "btn btn-ghost btn-small", text: "Edit name" });
  const editRow = el("div", { class: "edit-row hidden" }, [
    nameInput,
    el("button", {
      class: "btn btn-primary btn-small",
      text: "Save",
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
    editBtn.textContent = on ? "Cancel" : "Edit name";
  }

  ctx.root.appendChild(
    el("div", { class: "screen tab-screen profile-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("h1", { class: "screen-title", text: "Profile" }),
        el("div", { class: "glass profile-hero" }, [
          icon("avatar", "avatar"),
          el("div", { class: "profile-id" }, [
            nameEl,
            el("div", { class: "profile-tag", text: "Lv.1 · New player" }),
          ]),
          editBtn,
        ]),
        editRow,
        el("div", { class: "stat-grid" }, [
          stat("Rank", "Unranked", true),
          stat("Wins", "0"),
          stat("Losses", "0"),
          stat("Win rate", "—"),
        ]),
        el("h3", { class: "section-title", text: "Recent matches" }),
        el("div", { class: "history-list" }, [
          historyRow("chess", "Chess · Quick Match", "No records", true),
        ]),
        el("div", { class: "coming-note", text: "Stats and ranking are coming soon." }),
      ]),
      pillNav(ctx, "profile"),
    ]),
  );
};
