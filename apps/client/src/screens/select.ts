import { el, type AppContext, type Screen } from "../router.js";
import { GAMES, type GameEntry } from "../games.js";
import { art, objectUrl } from "../ui/art.js";
import { gameName, gameTagline, t } from "../i18n.js";

export interface PickerOptions {
  /** Heading shown above the carousel. */
  title: string;
  /** Where the back button / Escape goes. */
  onBack: Screen;
}

/**
 * Reusable game picker. A coverflow-style carousel: the centered card is large
 * and face-on, neighbors recede and rotate away, and the row wraps around
 * circularly. Drag / arrows / wheel to rotate; click the center card (or Select)
 * to choose. Choosing a playable game navigates to `resolve(game)`; locked
 * games just shake.
 *
 * Shared by Single Play (→ AI match) and Multi Play Quick Match (→ online).
 */
export function makeGamePicker(
  resolve: (game: GameEntry) => Screen,
  opts: PickerOptions,
): Screen {
  return (ctx: AppContext) => {
    const n = GAMES.length;
    let current = 0;

    const stage = el("div", { class: "carousel-stage" });
    const cards: HTMLElement[] = GAMES.map((game, i) => {
      const card = el(
        "div",
        {
          class: `game-card${game.playable ? "" : " locked"}`,
          onclick: () => onCardClick(i),
        },
        [
          art(objectUrl(game.id), "game-icon"),
          el("div", { class: "game-name", text: gameName(game.id) }),
          el("div", { class: "game-tag", text: gameTagline(game.id) }),
          game.playable ? null : el("div", { class: "card-soon", text: t("common.soon") }),
        ],
      );
      card.style.setProperty("--accent", game.color);
      stage.appendChild(card);
      return card;
    });

    const title = el("div", { class: "carousel-title" });
    const hint = el("div", { class: "carousel-hint", text: t("picker.hint") });
    const startBtn = el("button", { class: "btn btn-primary", text: t("picker.select"), onclick: () => startCurrent() });

    const screen = el("div", { class: "screen select-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(opts.onBack) }),
      el("h1", { class: "screen-title", text: opts.title }),
      el("div", { class: "carousel" }, [
        el("button", { class: "arrow left", html: "‹", onclick: () => rotate(-1) }),
        stage,
        el("button", { class: "arrow right", html: "›", onclick: () => rotate(1) }),
      ]),
      title,
      startBtn,
      hint,
    ]);

    ctx.root.appendChild(screen);

    /** Shortest circular distance from `current` to card `i`, in range [-n/2, n/2]. */
    function wrappedOffset(i: number): number {
      let o = i - current;
      if (o > n / 2) o -= n;
      if (o < -n / 2) o += n;
      return o;
    }

    function layout(): void {
      cards.forEach((card, i) => {
        const o = wrappedOffset(i);
        const abs = Math.abs(o);
        const spacing = 160;
        const x = o * spacing;
        const rot = Math.max(-60, Math.min(60, -o * 45));
        const scale = o === 0 ? 1 : Math.max(0.6, 0.85 - (abs - 1) * 0.12);
        const z = 200 - abs * 60;
        card.style.transform = `translateX(${x}px) translateZ(${z - 200}px) rotateY(${rot}deg) scale(${scale})`;
        card.style.zIndex = String(100 - abs);
        card.style.opacity = abs > 3 ? "0" : "1";
        card.style.pointerEvents = abs > 3 ? "none" : "auto";
        card.classList.toggle("center", o === 0);
      });
      const game = GAMES[current]!;
      title.textContent = gameName(game.id);
      // An unreleased game keeps its card in the carousel — the button and hint
      // say why it will not start, instead of leaving the shake to explain it.
      startBtn.textContent = game.playable ? t("picker.select") : t("common.soon");
      startBtn.classList.toggle("btn-primary", game.playable);
      startBtn.classList.toggle("btn-locked", !game.playable);
      hint.textContent = game.playable ? t("picker.hint") : t("picker.soon");
    }

    function rotate(dir: number): void {
      current = (current + dir + n) % n;
      layout();
    }

    function onCardClick(i: number): void {
      if (i === current) startCurrent();
      else rotate(wrappedOffset(i) > 0 ? 1 : -1);
    }

    function startCurrent(): void {
      const game = GAMES[current]!;
      if (game.playable) {
        ctx.navigate(resolve(game));
      } else {
        const card = cards[current]!;
        card.classList.remove("shake");
        void card.offsetWidth; // reflow to restart animation
        card.classList.add("shake");
      }
    }

    // Keyboard.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") rotate(-1);
      else if (e.key === "ArrowRight") rotate(1);
      else if (e.key === "Enter") startCurrent();
      else if (e.key === "Escape") ctx.navigate(opts.onBack);
    };
    window.addEventListener("keydown", onKey);

    // Wheel (horizontal or vertical) rotates.
    let wheelLock = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelLock) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 8) return;
      rotate(d > 0 ? 1 : -1);
      wheelLock = true;
      setTimeout(() => (wheelLock = false), 220);
    };
    screen.addEventListener("wheel", onWheel, { passive: false });

    // Pointer drag / swipe.
    let startX = 0;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      startX = e.clientX;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40) rotate(dx > 0 ? -1 : 1);
    };
    stage.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    layout();

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
      screen.removeEventListener("wheel", onWheel);
    };
  };
}
