import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import { DECK_CONFIGS, type DeckConfig } from "../deck-config.js";

const key = (id: string) => `skill-board:deck:${id}`;

function loadDeck(id: string): Set<number> {
  try {
    const raw = localStorage.getItem(key(id));
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch { /* ignore corrupt storage */ }
  return new Set();
}
function saveDeck(id: string, sel: Set<number>): void {
  localStorage.setItem(key(id), JSON.stringify([...sel]));
}

/**
 * 덱 만들기: pick a game, then build its deck within that game's limits
 * (deck size / hand size / time control). Card effects are 구현 예정, so the
 * pool is placeholder cards for now; selections persist in localStorage.
 */
export const deckScreen: Screen = (ctx: AppContext) => {
  let cfg: DeckConfig = DECK_CONFIGS[0]!;
  let sel = loadDeck(cfg.gameId);

  const panel = el("div", { class: "deck-panel" });
  const tabs = el(
    "div",
    { class: "deck-tabs" },
    DECK_CONFIGS.map((c) =>
      el("button", { class: `deck-tab${c.gameId === cfg.gameId ? " active" : ""}`, onclick: () => switchGame(c) }, [
        el("span", { class: "deck-tab-icon", text: c.icon }),
        el("span", { text: c.name }),
      ]),
    ),
  );

  ctx.root.appendChild(
    el("div", { class: "screen deck-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: "← 뒤로", onclick: () => { saveDeck(cfg.gameId, sel); ctx.navigate(menuScreen); } }),
      el("h1", { class: "screen-title", text: "덱 만들기" }),
      tabs,
      panel,
    ]),
  );

  renderPanel();

  function switchGame(c: DeckConfig): void {
    if (c.gameId === cfg.gameId) return;
    saveDeck(cfg.gameId, sel);
    cfg = c;
    sel = loadDeck(c.gameId);
    tabs.querySelectorAll(".deck-tab").forEach((n, i) => n.classList.toggle("active", DECK_CONFIGS[i]!.gameId === c.gameId));
    renderPanel();
  }

  function info(label: string, val: string): HTMLElement {
    return el("div", { class: "deck-info-item" }, [
      el("span", { class: "dii-val", text: val }),
      el("span", { class: "dii-label", text: label }),
    ]);
  }

  function renderPanel(): void {
    const counter = el("span", { class: "deck-counter" });
    const updateCounter = () => {
      counter.textContent = `선택 ${sel.size} / ${cfg.deckSize}`;
      counter.classList.toggle("full", sel.size >= cfg.deckSize);
    };

    const saveBtn = el("button", {
      class: "btn btn-primary btn-small",
      text: "덱 저장",
      onclick: () => { saveDeck(cfg.gameId, sel); saveBtn.textContent = "저장됨 ✓"; setTimeout(() => (saveBtn.textContent = "덱 저장"), 1200); },
    });

    const grid = el("div", { class: "deck-grid" });
    for (let i = 1; i <= cfg.poolSize; i++) {
      const card = el("div", { class: `deck-card-item${sel.has(i) ? " selected" : ""}` }, [
        el("div", { class: "dci-cost", text: "?" }),
        el("div", { class: "dci-art", text: "🃏" }),
        el("div", { class: "dci-banner", text: `카드 #${i}` }),
        el("div", { class: "dci-desc", text: "구현 예정" }),
        el("div", { class: "dci-selected-mark", text: "❖" }),
      ]);
      card.onclick = () => {
        if (sel.has(i)) sel.delete(i);
        else if (sel.size >= cfg.deckSize) {
          card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
          return;
        } else sel.add(i);
        card.classList.toggle("selected", sel.has(i));
        updateCounter();
      };
      grid.appendChild(card);
    }

    panel.replaceChildren(
      el("div", { class: "glass deck-info" }, [
        info("들고 갈 카드", `${cfg.deckSize}장`),
        info("손패", `${cfg.handSize}장`),
        info("제한 시간", `${cfg.totalMinutes}분`),
        info("초읽기", `${cfg.byoyomiSeconds}초/턴`),
        info("카드 풀", `${cfg.poolSize}종`),
      ]),
      el("div", { class: "deck-actions" }, [counter, saveBtn]),
      el("div", { class: "deck-note", text: "코스트는 매 턴 1~3 랜덤으로 쌓이며(최대 10), 패의 카드는 코스트를 소모해 사용합니다. 카드 효과는 구현 예정 — 지금은 덱 구성만 저장됩니다." }),
      grid,
    );
    updateCounter();
  }
};
