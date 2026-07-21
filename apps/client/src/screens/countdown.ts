import { el, type AppContext, type Screen } from "../router.js";

/**
 * Returns a screen that shows a 3·2·1 countdown, then navigates to `next`.
 * Used before a match starts.
 */
export function makeCountdown(next: Screen): Screen {
  return (ctx: AppContext) => {
    const num = el("div", { class: "countdown-num" });
    const screen = el("div", { class: "screen countdown-screen" }, [
      el("div", { class: "countdown-label", text: "GET READY" }),
      num,
    ]);
    ctx.root.appendChild(screen);

    const steps = ["3", "2", "1", "시작!"];
    let i = 0;
    const timers: number[] = [];

    const tick = () => {
      if (i >= steps.length) {
        ctx.navigate(next);
        return;
      }
      num.textContent = steps[i]!;
      num.classList.remove("pop");
      void num.offsetWidth; // restart animation
      num.classList.add("pop");
      i++;
      timers.push(window.setTimeout(tick, i === steps.length ? 500 : 800));
    };
    tick();

    return () => timers.forEach((t) => clearTimeout(t));
  };
}
