import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { art, icon, objectUrl } from "../ui/art.js";
import { gameName, shopItem, t } from "../i18n.js";
import {
  BOARD_THEMES, PIECE_SKINS, getBoardTheme, getPieceSkin, ownsSkin,
  setBoardTheme, setPieceSkin,
} from "../skins.js";
import { getNickname, NICK_MAX, setNickname } from "../player.js";
import { isPlaced, loadRank, PLACEMENT_MATCHES } from "../rank.js";
import { rankBadge } from "../ui/rank-badge.js";

/** Profile: nickname, the ladder standing, and the record behind it. */
export const profileScreen: Screen = (ctx: AppContext) => {
  const nickname = getNickname();
  const rank = loadRank();
  const decided = rank.wins + rank.losses;
  const winRate = decided === 0 ? "—" : `${Math.round((rank.wins / decided) * 100)}%`;

  const nameEl = el("h2", { class: "profile-name", text: nickname });
  const nameInput = el("input", { class: "field-input" }) as HTMLInputElement;
  nameInput.value = nickname;
  nameInput.maxLength = NICK_MAX;

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
        setNickname(v);
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

  // ── cosmetics ──────────────────────────────────────────────
  /**
   * What you are wearing, and what else you own. The shop sells skins but does
   * not put them on: dressing you on purchase means the one screen that takes
   * your money also changes how your game looks, which is a surprise nobody
   * asked for. So the choice lives here, next to your name.
   *
   * A skin you do not own is shown locked rather than hidden — a wardrobe with
   * the unowned rows deleted gives you no reason to visit the shop.
   */
  const skinRow = el("div", { class: "skin-row" });
  const themeRow = el("div", { class: "skin-row" });

  function paintCosmetics(): void {
    const wornPieces = getPieceSkin();
    const wornBoard = getBoardTheme();

    const tile = (
      id: string, artName: string, worn: boolean, owned: boolean, wear: () => void,
    ): HTMLElement => {
      const node = el("button", {
        class: `glass skin-tile${worn ? " worn" : ""}${owned ? "" : " locked"}`,
        onclick: owned && !worn ? wear : undefined,
      }, [
        art(objectUrl(artName), "skin-art"),
        el("span", { class: "skin-name", text: shopItem(id) }),
        el("span", {
          class: "skin-state",
          text: worn ? t("profile.worn") : owned ? t("profile.wear") : t("profile.locked"),
        }),
      ]);
      if (!owned) node.appendChild(icon("locked", "skin-lock"));
      return node;
    };

    skinRow.replaceChildren(
      ...PIECE_SKINS.map((s) =>
        tile(s.id, s.art, s.id === wornPieces, ownsSkin(s.id), () => {
          setPieceSkin(s.id);
          paintCosmetics();
        }),
      ),
    );
    themeRow.replaceChildren(
      ...BOARD_THEMES.map((s) =>
        tile(s.id, s.art, s.id === wornBoard, ownsSkin(s.id), () => {
          setBoardTheme(s.id);
          paintCosmetics();
        }),
      ),
    );
  }
  paintCosmetics();

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
        el("h3", { class: "section-title", text: t("profile.rank") }),
        el("div", { class: "glass rank-panel" }, [
          rankBadge(rank, "lg"),
          isPlaced(rank)
            ? null
            : el("div", { class: "rank-hint", text: t("rank.placementHint").replace("{total}", String(PLACEMENT_MATCHES)) }),
        ]),
        el("div", { class: "stat-grid" }, [
          stat(t("profile.wins"), String(rank.wins), true),
          stat(t("profile.losses"), String(rank.losses)),
          stat(t("profile.draws"), String(rank.draws)),
          stat(t("profile.winRate"), winRate),
        ]),
        el("h3", { class: "section-title", text: t("profile.pieceSkin") }),
        skinRow,
        el("h3", { class: "section-title", text: t("profile.boardTheme") }),
        themeRow,
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
