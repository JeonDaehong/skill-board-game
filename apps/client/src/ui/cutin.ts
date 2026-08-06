import { el } from "../router.js";
import { cardEl, cardTypeLine, fitNames } from "./card.js";
import { cardCostOf } from "../cards.js";
import { cardDesc, cardName, t } from "../i18n.js";

/**
 * The activation cut-in.
 *
 * Cards resolve in a single reducer step, so without this the only evidence
 * that a card was played is the board quietly changing — you cannot learn a
 * card list from a game that never shows you the cards. So every card that is
 * played is held over the middle of the field, big, with its rules text, for
 * five seconds.
 *
 * Five seconds is a long time to stare at something you already understand, so
 * a click anywhere skips it. And it gets out of the way on its own the moment
 * the engine actually wants something from you — a played card is asked for
 * its targets immediately, and a card you had to dismiss first would be a
 * modal standing between you and your own turn.
 */

/** How long a skill card stays readable. */
export const CUT_IN_MS = 5000;
/** A summon is a card too, but a ten-pawn master game cannot spare five seconds
 *  for each of them; they get a beat, not a monologue. */
export const SUMMON_CUT_IN_MS = 1800;
/**
 * The floor `dismiss()` will not go below. A card that needs a target puts the
 * engine into a pending step the same instant it is played, so without this
 * every card you aimed yourself would be cleared before it had drawn a frame —
 * you would only ever see the opponent's.
 */
export const MIN_HOLD_MS = 1800;

export interface CutInRequest {
  card: string;
  /** Played by the viewer, rather than against them. */
  mine: boolean;
  /** Summon / activation — decides the verb and how long it is held. */
  summon?: boolean;
  /**
   * Hold override, in ms. Your own card is a card you chose off a zoomed-up
   * face a moment ago: it wants a confirmation, not the five-second reveal the
   * opponent's card needs.
   */
  hold?: number;
}

export interface CutIn {
  /** The layer to mount. Fixed-position, so it can go anywhere in the screen. */
  node: HTMLElement;
  /** Queue a card. Two cards resolving back to back are shown in order. */
  show(req: CutInRequest): void;
  /**
   * Stand down: drop anything queued, and clear what is showing once it has
   * had `MIN_HOLD_MS` on screen. Safe to call when nothing is up, and safe to
   * call from a repaint — repeat calls do not stack.
   */
  dismiss(): void;
  dispose(): void;
}

export function createCutIn(): CutIn {
  const node = el("div", { class: "cut-in hidden" });
  const queue: CutInRequest[] = [];
  let timer: number | undefined;
  let dismissTimer: number | undefined;
  /** When the card currently on screen went up, for the minimum-hold floor. */
  let shownAt = 0;
  /** That card's own hold, so a short one is never stretched to the floor. */
  let holdOf = CUT_IN_MS;
  let dead = false;

  function paint(req: CutInRequest): void {
    const hold = req.hold ?? (req.summon ? SUMMON_CUT_IN_MS : CUT_IN_MS);
    const who = req.mine ? t("cutin.you") : t("cutin.them");
    const verb = req.summon ? t("cutin.summoned") : t("cutin.activated");

    const stage = el("div", { class: `cut-in-stage ${req.mine ? "mine" : "theirs"}` }, [
      el("div", { class: "cut-in-who" }, [
        el("span", { class: "cut-in-side", text: who }),
        el("span", { class: "cut-in-verb", text: verb }),
      ]),
      el("div", { class: "cut-in-body" }, [
        cardEl(req.card, "md"),
        el("div", { class: "cut-in-text" }, [
          el("div", { class: "cut-in-name", text: cardName(req.card) }),
          el("div", { class: "cut-in-meta" }, [
            el("span", { class: "cut-in-kind", text: cardTypeLine(req.card) }),
            el("span", { class: "cut-in-cost", text: `◈ ${cardCostOf(req.card)}` }),
          ]),
          el("p", { class: "cut-in-desc", text: cardDesc(req.card) }),
        ]),
      ]),
      el("div", { class: "cut-in-timer" }),
      el("div", { class: "cut-in-skip", text: t("cutin.skip") }),
    ]);
    stage.style.setProperty("--hold", `${hold}ms`);

    node.replaceChildren(stage);
    node.classList.remove("hidden");
    fitNames(node);
    shownAt = Date.now();
    holdOf = hold;

    timer = window.setTimeout(() => {
      timer = undefined;
      next();
    }, hold);
  }

  function next(): void {
    if (dead) return;
    const req = queue.shift();
    if (!req) {
      node.classList.add("hidden");
      node.replaceChildren();
      return;
    }
    paint(req);
  }

  function clear(): void {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = undefined; }
    queue.length = 0;
    node.classList.add("hidden");
    node.replaceChildren();
  }

  function dismiss(): void {
    if (dead) return;
    queue.length = 0;
    if (timer === undefined) return; // nothing on screen
    const left = shownAt + Math.min(MIN_HOLD_MS, holdOf) - Date.now();
    if (left <= 0) return clear();
    if (dismissTimer !== undefined) return;
    const at = shownAt;
    dismissTimer = window.setTimeout(() => {
      dismissTimer = undefined;
      // A newer card may have taken the stage while we waited; that one gets
      // its own hold rather than inheriting this one's deadline.
      if (shownAt === at) clear();
    }, left);
  }

  // A click anywhere on the layer skips the rest of the hold.
  node.onclick = () => next();

  return {
    node,
    show(req) {
      if (dead) return;
      // A card arriving cancels a stand-down aimed at the one before it.
      if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = undefined; }
      queue.push(req);
      // A queue longer than a couple of cards is a chain nobody will sit
      // through; the oldest waiting card is the one already out of date.
      if (queue.length > 2) queue.splice(0, queue.length - 2);
      if (timer === undefined) next();
    },
    dismiss,
    dispose() {
      dead = true;
      clear();
    },
  };
}
