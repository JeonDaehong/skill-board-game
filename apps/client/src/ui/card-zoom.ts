import { el } from "../router.js";
import { cardEl, cardTypeLine, fitNames } from "./card.js";
import { cardCostOf } from "../cards.js";
import { cardDesc, cardName, t } from "../i18n.js";

/**
 * A card, blown up, with the decision attached.
 *
 * A card in hand renders about a hundred pixels wide, where the rules text is
 * a smudge — so committing to one meant either remembering what it does or
 * finding out afterwards. Clicking a card now opens it at full size with its
 * effect spelled out, and playing it is a second, deliberate click.
 */

export interface ZoomAction {
  label: string;
  /** The one that actually commits — gold, and focused when the panel opens. */
  primary?: boolean;
  run(): void;
}

export interface ZoomOptions {
  card: string;
  /** Why this card cannot be used right now, if it cannot. */
  note?: string | null;
  /** What can be done with it. Empty is fine — then this is just a magnifier. */
  actions?: ZoomAction[];
}

let openPanel: (() => void) | null = null;

/** Close whatever is open, if anything. Safe to call at any time. */
export function closeCardZoom(): void {
  openPanel?.();
}

/**
 * A whole pile, laid out face up. The discard pile decides real games — which
 * counters are already spent, what can still be fished back out — and a number
 * on a stack is not something you can plan against.
 */
export function openPileView(title: string, cards: string[]): void {
  closeCardZoom();

  const overlay = el("div", { class: "zoom-overlay" });
  const close = (): void => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    if (openPanel === close) openPanel = null;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  const grid = el("div", { class: "pile-grid" },
    cards.map((id) => {
      const node = cardEl(id, "sm");
      node.classList.add("pile-card");
      // Straight from the pile into the magnifier, so the rules text is one
      // click away rather than unreadable at thumbnail size.
      node.onclick = () => openCardZoom({ card: id });
      return node;
    }),
  );

  const panel = el("div", { class: "glass zoom-panel pile-panel" }, [
    el("div", { class: "pile-head" }, [
      el("h2", { class: "zoom-name", text: title }),
      el("span", { class: "pile-count", text: String(cards.length) }),
    ]),
    cards.length === 0 ? el("div", { class: "preview-empty", text: t("zone.empty") }) : grid,
    el("div", { class: "zoom-actions" }, [
      el("button", { class: "btn btn-ghost", text: t("zoom.close"), onclick: close }),
    ]),
  ]);
  panel.onclick = (e) => e.stopPropagation();

  overlay.onclick = close;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  fitNames(overlay);
  document.addEventListener("keydown", onKey);
  openPanel = close;
}

export function openCardZoom(opts: ZoomOptions): void {
  // Only ever one at a time: opening a second card means you changed your mind
  // about the first.
  closeCardZoom();

  const overlay = el("div", { class: "zoom-overlay" });
  const actions = opts.actions ?? [];

  const close = (): void => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    if (openPanel === close) openPanel = null;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  const buttons = actions.map((a) =>
    el("button", {
      class: `btn ${a.primary ? "btn-primary" : "btn-ghost"}`,
      text: a.label,
      onclick: () => { close(); a.run(); },
    }),
  );
  buttons.push(el("button", { class: "btn btn-ghost", text: t("zoom.close"), onclick: close }));

  const panel = el("div", { class: "glass zoom-panel" }, [
    el("div", { class: "zoom-body" }, [
      cardEl(opts.card, "lg"),
      el("div", { class: "zoom-text" }, [
        el("h2", { class: "zoom-name", text: cardName(opts.card) }),
        el("div", { class: "zoom-meta" }, [
          el("span", { class: "zoom-kind", text: cardTypeLine(opts.card) }),
          el("span", { class: "zoom-cost", text: `◈ ${cardCostOf(opts.card)}` }),
        ]),
        el("p", { class: "zoom-desc", text: cardDesc(opts.card) }),
        opts.note ? el("div", { class: "zoom-note", text: opts.note }) : null,
      ]),
    ]),
    el("div", { class: "zoom-actions" }, buttons),
  ]);
  // A click on the card itself should not count as a click on the backdrop.
  panel.onclick = (e) => e.stopPropagation();

  overlay.onclick = close;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  fitNames(overlay);
  document.addEventListener("keydown", onKey);
  openPanel = close;

  // Enter commits whatever the card is for, so a confident player never has to
  // aim at the button.
  const primary = buttons.find((b) => b.classList.contains("btn-primary"));
  (primary ?? buttons[buttons.length - 1])?.focus();
}
