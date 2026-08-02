import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import { DECK_CONFIGS, type DeckConfig } from "../deck-config.js";
import { SKILLS, skillById, type Skill } from "../skills.js";
import { art, frameUrl, objectUrl, skillArtUrl } from "../ui/art.js";

/** cardId → how many copies the deck holds. */
type DeckMap = Record<string, number>;

const key = (id: string) => `skill-board:deck:v2:${id}`;

function loadDeck(id: string): DeckMap {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DeckMap;
    // Drop entries for cards that no longer exist.
    const out: DeckMap = {};
    for (const [k, v] of Object.entries(parsed)) if (skillById(k) && v > 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}
function saveDeck(id: string, deck: DeckMap): void {
  localStorage.setItem(key(id), JSON.stringify(deck));
}

/**
 * Rarity tier, derived from cost. It drives the card's frame colour, the art
 * tint and the gem — a 5-cost card should *look* like a bomb next to a 1-cost.
 */
const TIERS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const tierOf = (skill: Skill) => TIERS[Math.min(TIERS.length, Math.max(1, skill.cost)) - 1]!;

/**
 * One collectible card. `size` picks the scale: "sm" for the pool grid, "lg"
 * for the inspector, "xs" for the deck tray at the bottom.
 *
 * The painted frame is a PNG whose art window was keyed out, so the artwork
 * simply sits behind it and shows through the hole — no per-frame geometry to
 * chase, which matters because the five frames are hand-painted and their
 * windows are not pixel-identical.
 */
function cardEl(skill: Skill, size: "xs" | "sm" | "lg"): HTMLElement {
  const tier = tierOf(skill);
  const artLayer = el("div", { class: "tcg-art" }, [
    art(skillArtUrl(skill.id), "tcg-art-img"),
  ]);
  const frame = el("div", { class: "tcg-frame" });
  frame.style.backgroundImage = `url("${frameUrl(tier)}")`;

  const children: (Node | null)[] = [
    artLayer,
    frame,
    el("span", { class: "tcg-gem", text: String(skill.cost) }),
    el("div", { class: "tcg-name", text: skill.name }),
  ];
  if (size !== "xs") {
    children.push(
      el("div", { class: "tcg-text" }, [
        el("span", { class: "tcg-type", text: skill.type === "active" ? "ACTIVE" : "PASSIVE" }),
        el("span", { text: skill.desc }),
      ]),
    );
  }

  return el("div", { class: `tcg-card ${size} t-${tier}` }, children);
}

/**
 * Deck Builder: browse the full card pool as art, inspect one card blown up,
 * and add copies until the deck is full. Card effects aren't implemented yet —
 * this builds and persists the deck list itself (localStorage, per game).
 */
export const deckScreen: Screen = (ctx: AppContext) => {
  let cfg: DeckConfig = DECK_CONFIGS[0]!;
  let deck: DeckMap = loadDeck(cfg.gameId);
  let focused: Skill = SKILLS[0]!;
  let costFilter: number | null = null;
  let typeFilter: "all" | "active" | "passive" = "all";

  const total = () => Object.values(deck).reduce((a, b) => a + b, 0);
  const copies = (id: string) => deck[id] ?? 0;
  const isFull = () => total() >= cfg.deckSize;

  // ── panels ────────────────────────────────────────────────
  const inspector = el("aside", { class: "deck-inspector" });
  const grid = el("div", { class: "pool-grid" });
  const tray = el("div", { class: "tray-cards" });
  const trayCount = el("span", { class: "tray-count" });
  const trayRules = el("span", { class: "tray-rules" });
  const saveBtn = el("button", {
    class: "btn btn-primary btn-small",
    text: "Save deck",
    onclick: () => {
      saveDeck(cfg.gameId, deck);
      saveBtn.textContent = "Saved ✓";
      setTimeout(() => (saveBtn.textContent = "Save deck"), 1200);
    },
  });

  const tabs = el(
    "div",
    { class: "deck-tabs" },
    DECK_CONFIGS.map((c) =>
      el("button", { class: `deck-tab${c.gameId === cfg.gameId ? " active" : ""}`, onclick: () => switchGame(c) }, [
        art(objectUrl(c.gameId), "deck-tab-icon"),
        el("span", { text: c.name }),
      ]),
    ),
  );

  const filterBar = el("div", { class: "pool-filters" }, [
    el("div", { class: "filter-group" }, [
      filterChip("All", () => costFilter === null, () => { costFilter = null; renderAll(); }),
      ...[1, 2, 3, 4, 5].map((c) =>
        filterChip(`◈${c}`, () => costFilter === c, () => { costFilter = costFilter === c ? null : c; renderAll(); }),
      ),
    ]),
    el("div", { class: "filter-group" }, [
      filterChip("Active", () => typeFilter === "active", () => { typeFilter = typeFilter === "active" ? "all" : "active"; renderAll(); }),
      filterChip("Passive", () => typeFilter === "passive", () => { typeFilter = typeFilter === "passive" ? "all" : "passive"; renderAll(); }),
    ]),
  ]);

  function filterChip(label: string, on: () => boolean, onclick: () => void): HTMLElement {
    const chip = el("button", { class: `filter-chip${on() ? " active" : ""}`, text: label, onclick });
    chip.dataset.on = String(on());
    return chip;
  }

  ctx.root.appendChild(
    el("div", { class: "screen deck-screen" }, [
      el("div", { class: "deck-head" }, [
        el("button", {
          class: "btn btn-ghost btn-small",
          text: "← Back",
          onclick: () => { saveDeck(cfg.gameId, deck); ctx.navigate(menuScreen); },
        }),
        el("h1", { class: "screen-title deck-title", text: "Deck Builder" }),
        tabs,
      ]),
      el("div", { class: "deck-main" }, [
        inspector,
        el("section", { class: "deck-pool" }, [filterBar, grid]),
      ]),
      el("div", { class: "deck-tray glass" }, [
        el("div", { class: "tray-head" }, [
          el("span", { class: "tray-label", text: "Your deck" }),
          trayCount,
          trayRules,
          saveBtn,
        ]),
        tray,
      ]),
    ]),
  );

  renderAll();

  // ── actions ───────────────────────────────────────────────
  function switchGame(c: DeckConfig): void {
    if (c.gameId === cfg.gameId) return;
    saveDeck(cfg.gameId, deck);
    cfg = c;
    deck = loadDeck(c.gameId);
    tabs.querySelectorAll(".deck-tab").forEach((n, i) => n.classList.toggle("active", DECK_CONFIGS[i]!.gameId === c.gameId));
    renderAll();
  }

  function add(skill: Skill, source?: HTMLElement): void {
    if (copies(skill.id) >= cfg.maxCopies || isFull()) return bump(source);
    deck[skill.id] = copies(skill.id) + 1;
    focused = skill;
    renderAll();
  }
  function remove(skill: Skill): void {
    const n = copies(skill.id);
    if (n <= 0) return;
    if (n === 1) delete deck[skill.id];
    else deck[skill.id] = n - 1;
    renderAll();
  }
  function bump(node?: HTMLElement): void {
    const target = node ?? trayCount;
    target.classList.remove("shake");
    void target.offsetWidth; // reflow to restart the animation
    target.classList.add("shake");
  }

  // ── rendering ─────────────────────────────────────────────
  function renderAll(): void {
    renderInspector();
    renderPool();
    renderTray();
    filterBar.querySelectorAll<HTMLElement>(".filter-chip").forEach((chip) => {
      const label = chip.textContent ?? "";
      const on =
        label === "All" ? costFilter === null
        : label.startsWith("◈") ? costFilter === Number(label.slice(1))
        : typeFilter === label.toLowerCase();
      chip.classList.toggle("active", on);
    });
  }

  function renderInspector(): void {
    const n = copies(focused.id);
    const meta = (label: string, value: string) =>
      el("div", { class: "insp-meta" }, [
        el("span", { class: "im-label", text: label }),
        el("span", { class: "im-value", text: value }),
      ]);

    const minus = el("button", { class: "step-btn", text: "−", onclick: () => remove(focused) }) as HTMLButtonElement;
    const plus = el("button", { class: "step-btn primary", text: "+", onclick: () => add(focused) }) as HTMLButtonElement;
    minus.disabled = n === 0;
    plus.disabled = n >= cfg.maxCopies || isFull();

    inspector.replaceChildren(
      cardEl(focused, "lg"),
      el("div", { class: "insp-body" }, [
        el("div", { class: "insp-metas" }, [
          meta("Cost", String(focused.cost)),
          meta("Type", focused.type === "active" ? "Active" : "Passive"),
          meta("Cooldown", focused.cooldown ? `${focused.cooldown} turns` : "—"),
          meta("Uses", focused.usesPerGame ? `${focused.usesPerGame}/game` : "∞"),
        ]),
        el("div", { class: "insp-steps" }, [
          minus,
          el("span", { class: "step-count", text: `${n} / ${cfg.maxCopies}` }),
          plus,
        ]),
      ]),
    );
  }

  function renderPool(): void {
    const pool = SKILLS.filter(
      (s) => (costFilter === null || s.cost === costFilter) && (typeFilter === "all" || s.type === typeFilter),
    );
    if (pool.length === 0) {
      grid.replaceChildren(el("div", { class: "pool-empty", text: "No cards match these filters." }));
      return;
    }
    grid.replaceChildren(
      ...pool.map((skill) => {
        const n = copies(skill.id);
        const card = cardEl(skill, "sm");
        if (n > 0) {
          card.classList.add("owned");
          card.appendChild(el("span", { class: "tcg-count", text: `×${n}` }));
        }
        if (skill.id === focused.id) card.classList.add("focused");
        card.onclick = () => add(skill, card);
        card.oncontextmenu = (e) => { e.preventDefault(); remove(skill); };
        card.onmouseenter = () => {
          if (focused.id === skill.id) return;
          focused = skill;
          renderInspector();
          grid.querySelectorAll(".tcg-card").forEach((c) => c.classList.remove("focused"));
          card.classList.add("focused");
        };
        return card;
      }),
    );
  }

  function renderTray(): void {
    const n = total();
    trayCount.textContent = `${n} / ${cfg.deckSize}`;
    trayCount.classList.toggle("full", n >= cfg.deckSize);
    trayRules.textContent =
      `Hand ${cfg.handSize} · ${cfg.totalMinutes} min · ${cfg.byoyomiSeconds}s byoyomi · max ${cfg.maxCopies} copies — card effects coming soon`;

    const entries = Object.entries(deck)
      .map(([id, count]) => ({ skill: skillById(id)!, count }))
      .filter((e) => e.skill)
      .sort((a, b) => a.skill.cost - b.skill.cost || a.skill.name.localeCompare(b.skill.name));

    if (entries.length === 0) {
      tray.replaceChildren(
        el("div", { class: "tray-empty", text: "Click a card to add it. Right-click to remove." }),
      );
      return;
    }
    tray.replaceChildren(
      ...entries.flatMap(({ skill, count }) =>
        Array.from({ length: count }, () => {
          const mini = cardEl(skill, "xs");
          mini.title = `${skill.name} — click to remove`;
          mini.onclick = () => remove(skill);
          mini.onmouseenter = () => { focused = skill; renderInspector(); };
          return mini;
        }),
      ),
    );
  }
};
