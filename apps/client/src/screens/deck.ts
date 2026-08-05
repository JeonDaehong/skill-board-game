import {
  MAX_COPIES_PIECE,
  MAX_COPIES_SKILL,
  SKILLS,
  isPieceCard,
  modeRules,
  skillKind,
  skillMeta,
  type GameMode,
  type SkillKind,
} from "@skill/engine";
import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import {
  DECK_MODES, deckTotal, loadDeck, maxAllowed, saveDeck, type DeckMap,
} from "../decks.js";
import { PIECE_CARDS, ownedCount } from "../economy.js";
import { cardCostOf, compareCards } from "../cards.js";
import { cardEl, fitNames } from "../ui/card.js";
import { openCardPreview } from "../ui/preview.js";
import { art, icon, objectUrl, type IconName } from "../ui/art.js";
import { cardDesc, cardName, modeName, t } from "../i18n.js";

/**
 * Deck Builder. One deck per mode, built from the cards you actually own:
 * 30 skill cards for skill mode, 50 mixed cards for master mode.
 *
 * The pool shows every card in the game, including ones you do not own — a
 * collection game where unowned cards are invisible gives you nothing to want.
 * They are simply dimmed and refuse to be added.
 */
export const deckScreen: Screen = (ctx) => makeDeckScreen("skill", menuScreen)(ctx);

export function makeDeckScreen(initialMode: GameMode, onBack: Screen): Screen {
  return (ctx: AppContext) => {
    // Classic has no deck to build, so the builder always opens on a real one.
    let mode: GameMode = DECK_MODES.includes(initialMode) ? initialMode : "skill";
    let deck: DeckMap = loadDeck(mode);
    let focused: string = SKILLS[0]?.id ?? "";
    let costFilter: number | null = null;
    // The five kinds docs/skill.md sorts skills into, plus the two card types.
    let kindFilter: "all" | "skill" | "piece" | SkillKind = "all";

    const cfg = () => modeRules(mode);
    const total = () => deckTotal(deck);
    const copies = (id: string) => deck[id] ?? 0;
    const isFull = () => total() >= cfg().deckSize;

    // ── panels ────────────────────────────────────────────────
    const inspector = el("aside", { class: "deck-inspector" });
    const grid = el("div", { class: "pool-grid" });
    const tray = el("div", { class: "tray-cards" });
    const trayCount = el("span", { class: "tray-count" });
    const trayRules = el("span", { class: "tray-rules" });
    const trayState = el("span", { class: "tray-state" });
    const saveBtn = el("button", {
      class: "btn btn-primary btn-small",
      text: t("deck.save"),
      onclick: () => {
        saveDeck(mode, deck);
        saveBtn.textContent = t("deck.saved");
        setTimeout(() => (saveBtn.textContent = t("deck.save")), 1200);
      },
    });

    /** One tab per mode that has a deck. */
    const tabs = el(
      "div",
      { class: "deck-tabs" },
      DECK_MODES.map((m) =>
        el("button", { class: `deck-tab${m === mode ? " active" : ""}`, onclick: () => switchMode(m) }, [
          art(objectUrl("chess"), "deck-tab-icon"),
          el("span", { text: modeName(m) }),
        ]),
      ),
    );

    const filterBar = el("div", { class: "pool-filters" });

    ctx.root.appendChild(
      el("div", { class: "screen deck-screen" }, [
        el("div", { class: "deck-head" }, [
          el("button", {
            class: "btn btn-ghost btn-small",
            text: t("common.back"),
            onclick: () => { saveDeck(mode, deck); ctx.navigate(onBack); },
          }),
          el("h1", { class: "screen-title deck-title", text: t("deck.title") }),
          tabs,
        ]),
        el("div", { class: "deck-main" }, [
          inspector,
          el("section", { class: "deck-pool" }, [filterBar, grid]),
        ]),
        el("div", { class: "deck-tray glass" }, [
          el("div", { class: "tray-head" }, [
            el("span", { class: "tray-label", text: t("deck.yours") }),
            trayCount,
            trayState,
            trayRules,
            el("button", { class: "btn btn-ghost btn-small", text: t("deck.autofill"), onclick: () => autofill() }),
            el("button", { class: "btn btn-ghost btn-small", text: t("deck.clear"), onclick: () => { deck = {}; renderAll(); } }),
            saveBtn,
          ]),
          tray,
        ]),
      ]),
    );

    buildFilters();
    renderAll();

    // ── the card pool ─────────────────────────────────────────
    /** Every card in the game, in a stable order, for the current mode. */
    function poolCards(): string[] {
      const skills = SKILLS.map((s) => s.id);
      const pieces = cfg().pieceCards ? PIECE_CARDS.map((p) => p.id) : [];
      return [...pieces, ...skills].sort(compareCards);
    }

    function filtered(): string[] {
      return poolCards().filter((id) => {
        if (costFilter !== null && cardCostOf(id) !== costFilter) return false;
        if (kindFilter === "all") return true;
        if (kindFilter === "piece") return isPieceCard(id);
        if (kindFilter === "skill") return !isPieceCard(id);
        // The remaining filters name a skill card's kind, so pieces drop out.
        return skillKind(id) === kindFilter;
      });
    }

    function buildFilters(): void {
      const chip = (key: string, label: string, onclick: () => void, glyph?: IconName) => {
        const node = el("button", { class: "filter-chip", onclick }, [
          glyph ? icon(glyph, "filter-icon") : null,
          el("span", { text: label }),
        ]);
        node.dataset.filter = key;
        return node;
      };
      const kindChip = (kind: SkillKind) =>
        chip(`kind:${kind}`, t(`kind.${kind}` as never), () => setKind(kind), `kind-${kind}`);
      const kinds: (Node | null)[] = [
        cfg().pieceCards ? chip("kind:piece", t("deck.pieces"), () => setKind("piece")) : null,
        cfg().pieceCards ? chip("kind:skill", t("deck.skills"), () => setKind("skill")) : null,
        // The five kinds a skill card can be, in the order docs/skill.md lists them.
        kindChip("normal"),
        kindChip("quick"),
        kindChip("enchant"),
        kindChip("lasting"),
        kindChip("counter"),
      ];
      filterBar.replaceChildren(
        el("div", { class: "filter-group" }, [
          chip("cost:all", t("deck.all"), () => { costFilter = null; renderAll(); }),
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) =>
            chip(`cost:${c}`, `◈${c}`, () => { costFilter = costFilter === c ? null : c; renderAll(); }),
          ),
        ]),
        el("div", { class: "filter-group" }, kinds),
      );
    }

    function setKind(k: typeof kindFilter): void {
      kindFilter = kindFilter === k ? "all" : k;
      renderAll();
    }

    // ── actions ───────────────────────────────────────────────
    function switchMode(m: GameMode): void {
      if (m === mode) return;
      saveDeck(mode, deck);
      mode = m;
      deck = loadDeck(m);
      // Master's piece filters are meaningless in skill mode and vice versa.
      kindFilter = "all";
      tabs.querySelectorAll(".deck-tab").forEach((n, i) => n.classList.toggle("active", DECK_MODES[i] === m));
      buildFilters();
      renderAll();
    }

    function add(id: string, source?: HTMLElement): void {
      if (copies(id) >= maxAllowed(mode, id) || isFull()) return bump(source);
      deck[id] = copies(id) + 1;
      focused = id;
      renderAll();
    }

    function remove(id: string): void {
      const n = copies(id);
      if (n <= 0) return;
      if (n === 1) delete deck[id];
      else deck[id] = n - 1;
      renderAll();
    }

    /**
     * Top the deck up to its size from what is left in the collection, cheapest
     * first. It is the fastest way to get a legal deck out of a fresh account,
     * and it never adds a card the player does not own.
     */
    function autofill(): void {
      const candidates = poolCards()
        .filter((id) => maxAllowed(mode, id) > 0)
        .sort(compareCards);
      for (const id of candidates) {
        while (!isFull() && copies(id) < maxAllowed(mode, id)) deck[id] = copies(id) + 1;
        if (isFull()) break;
      }
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
      if (!filtered().includes(focused)) focused = filtered()[0] ?? poolCards()[0] ?? "";
      renderInspector();
      renderPool();
      renderTray();
      filterBar.querySelectorAll<HTMLElement>(".filter-chip").forEach((chip) => {
        const [kind, value] = (chip.dataset.filter ?? "").split(":");
        const on =
          kind === "cost"
            ? (value === "all" ? costFilter === null : costFilter === Number(value))
            : kindFilter === value;
        chip.classList.toggle("active", on);
      });
    }

    function renderInspector(): void {
      if (!focused) return inspector.replaceChildren();
      const owned = ownedCount(focused);
      const cap = maxAllowed(mode, focused);
      const n = copies(focused);
      const meta = (label: string, value: string) =>
        el("div", { class: "insp-meta" }, [
          el("span", { class: "im-label", text: label }),
          el("span", { class: "im-value", text: value }),
        ]);

      const minus = el("button", { class: "step-btn", text: "−", onclick: () => remove(focused) }) as HTMLButtonElement;
      const plus = el("button", { class: "step-btn primary", text: "+", onclick: () => add(focused) }) as HTMLButtonElement;
      minus.disabled = n === 0;
      plus.disabled = n >= cap || isFull();

      const kind = skillKind(focused);
      const typeText = isPieceCard(focused) ? t("deck.pieces") : kind ? t(`kind.${kind}` as never) : "—";
      const kindNote = isPieceCard(focused)
        ? t("summon.zone")
        : kind ? t(`kind.${kind}Note` as never) : "—";

      inspector.replaceChildren(
        cardEl(focused, "lg"),
        el("div", { class: "insp-body" }, [
          el("div", { class: "insp-desc", text: cardDesc(focused) }),
          el("div", { class: "insp-metas" }, [
            meta(t("deck.cost"), String(cardCostOf(focused))),
            meta(t("deck.type"), typeText),
            meta(t("deck.owned"), String(owned)),
            meta(t("deck.speed"), kindNote),
          ]),
          // The rules text says what it does; the preview shows it happening.
          el("button", {
            class: "btn btn-ghost btn-small btn-block",
            text: t("deck.detail"),
            onclick: () => openCardPreview(ctx, focused),
          }),
          owned === 0
            ? el("div", { class: "insp-locked" }, [
                el("span", { text: t("deck.notOwned") }),
                el("span", { class: "insp-hint", text: t("deck.getInShop") }),
              ])
            : el("div", { class: "insp-steps" }, [
                minus,
                el("span", { class: "step-count", text: `${n} / ${cap}` }),
                plus,
              ]),
        ]),
      );
      fitNames(inspector);
    }

    function renderPool(): void {
      const pool = filtered();
      if (pool.length === 0) {
        grid.replaceChildren(el("div", { class: "pool-empty", text: t("deck.noMatch") }));
        return;
      }
      grid.replaceChildren(
        ...pool.map((id) => {
          const n = copies(id);
          const owned = ownedCount(id);
          const card = cardEl(id, "sm");
          if (owned === 0) card.classList.add("unowned");
          if (n > 0) {
            card.classList.add("owned");
            card.appendChild(el("span", { class: "tcg-count", text: `×${n}` }));
          }
          card.appendChild(el("span", { class: "tcg-stock", text: `${owned}` }));
          if (id === focused) card.classList.add("focused");
          card.onclick = () => add(id, card);
          card.oncontextmenu = (e) => { e.preventDefault(); remove(id); };
          card.onmouseenter = () => {
            if (focused === id) return;
            focused = id;
            renderInspector();
            grid.querySelectorAll(".tcg-card").forEach((c) => c.classList.remove("focused"));
            card.classList.add("focused");
          };
          return card;
        }),
      );
      fitNames(grid);
    }

    function renderTray(): void {
      const n = total();
      const want = cfg().deckSize;
      trayCount.textContent = `${n} / ${want}`;
      trayCount.classList.toggle("full", n === want);

      trayState.className = `tray-state ${n === want ? "ok" : "warn"}`;
      trayState.textContent =
        n === want ? t("deck.complete")
        : n < want ? t("deck.short").replace("{n}", String(want - n))
        : t("deck.over").replace("{n}", String(n - want));

      trayRules.textContent = t("deck.rules")
        .replace("{size}", String(want))
        .replace("{skillCopies}", String(MAX_COPIES_SKILL))
        .replace("{pieceCopies}", String(MAX_COPIES_PIECE));

      const entries = Object.entries(deck)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => compareCards(a, b));

      if (entries.length === 0) {
        tray.replaceChildren(el("div", { class: "tray-empty", text: t("deck.empty") }));
        return;
      }
      // Stacks, not one node per copy: a master deck can hold fifty pawns, and
      // fifty identical thumbnails is a scroll bar, not information.
      tray.replaceChildren(
        ...entries.map(([id, count]) => {
          const stack = el("div", { class: "tray-stack" }, [cardEl(id, "xs")]);
          stack.appendChild(el("span", { class: "stack-count", text: `×${count}` }));
          stack.title = cardName(id);
          stack.onclick = () => remove(id);
          stack.oncontextmenu = (e) => { e.preventDefault(); add(id); };
          stack.onmouseenter = () => { focused = id; renderInspector(); };
          return stack;
        }),
      );
      fitNames(tray);
    }
  };
}
