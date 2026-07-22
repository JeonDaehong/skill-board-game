import { el, type AppContext, type Screen } from "../router.js";

export type NavTab = "home" | "profile" | "shop";

/**
 * The persistent bottom pill nav (홈 / 내정보 / 상점). Lazy-imports the target
 * screens to avoid import cycles between the tabs.
 */
export function pillNav(ctx: AppContext, active: NavTab): HTMLElement {
  const item = (tab: NavTab, icon: string, label: string, load: () => Promise<{ screen: Screen }>) =>
    el("button", {
      class: `pill-item${tab === active ? " active" : ""}`,
      onclick: () => {
        if (tab === active) return;
        void load().then((m) => ctx.navigate(m.screen));
      },
    }, [
      el("span", { class: "pill-icon", text: icon }),
      el("span", { class: "pill-label", text: label }),
    ]);

  return el("nav", { class: "pill-nav glass" }, [
    item("home", "🏠", "홈", async () => ({ screen: (await import("./menu.js")).menuScreen })),
    item("profile", "👤", "내 정보", async () => ({ screen: (await import("./profile.js")).profileScreen })),
    item("shop", "🛍️", "상점", async () => ({ screen: (await import("./shop.js")).shopScreen })),
  ]);
}
