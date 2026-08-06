import { el } from "../router.js";
import { art, pieceUrl } from "./art.js";
import { getLang, t } from "../i18n.js";
import {
  APEX, PLACEMENT_MATCHES, RP_PER_DIVISION, divisionLabel, divisionOf, divisionProgress,
  isPlaced, type RankState,
} from "../rank.js";

/**
 * A rank, wherever one is shown. The emblem is the piece the tier is named
 * after — a ladder built out of the game's own pieces should look like one.
 *
 * `sm` is the chip form for a lobby or a header; `lg` adds the rating bar and
 * the division underneath.
 */
export function rankBadge(state: RankState, size: "sm" | "lg" = "sm"): HTMLElement {
  const ko = getLang() === "ko";

  if (!isPlaced(state)) {
    // No rank yet: the thing worth showing is how many placements are left.
    return el("div", { class: `rank-badge ${size} unplaced` }, [
      el("div", { class: "rank-emblem placement", text: "?" }),
      el("div", { class: "rank-text" }, [
        el("span", { class: "rank-name", text: t("rank.placements") }),
        el("span", {
          class: "rank-sub",
          text: t("rank.placementCount")
            .replace("{n}", String(state.placed))
            .replace("{total}", String(PLACEMENT_MATCHES)),
        }),
      ]),
    ]);
  }

  const index = state.index ?? 0;
  const d = divisionOf(index);
  const apex = index >= APEX;

  const bar = el("div", { class: "rank-bar" }, [el("i")]);
  (bar.firstElementChild as HTMLElement).style.width = `${Math.round(divisionProgress(state) * 100)}%`;

  return el("div", { class: `rank-badge ${size} t-${d.tier.id}` }, [
    art(pieceUrl(d.tier.sprite), "rank-emblem"),
    el("div", { class: "rank-text" }, [
      el("span", { class: "rank-name", text: divisionLabel(index, ko) }),
      el("span", {
        class: "rank-sub",
        // At the top there is no next division to fill, so the rating stops
        // being a bar and starts being a score.
        text: apex ? `${state.rp} RP` : `${state.rp} / ${RP_PER_DIVISION} RP`,
      }),
      size === "lg" && !apex ? bar : null,
    ]),
  ]);
}
