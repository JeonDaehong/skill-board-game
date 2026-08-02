import { el, type AppContext, type Screen } from "../router.js";
import { icon, type IconName } from "../ui/art.js";

export type NavTab = "home" | "profile" | "shop";

/**
 * The persistent bottom pill nav (Home / Profile / Shop). Lazy-imports the
 * target screens to avoid import cycles between the tabs.
 */
export function pillNav(ctx: AppContext, active: NavTab): HTMLElement {
  const item = (tab: NavTab, name: IconName, label: string, load: () => Promise<{ screen: Screen }>) =>
    el("button", {
      class: `pill-item${tab === active ? " active" : ""}`,
      onclick: () => {
        if (tab === active) return;
        void load().then((m) => ctx.navigate(m.screen));
      },
    }, [
      icon(name, "pill-icon"),
      el("span", { class: "pill-label", text: label }),
    ]);

  return el("nav", { class: "pill-nav glass" }, [
    item("home", "home", "Home", async () => ({ screen: (await import("./menu.js")).menuScreen })),
    item("profile", "profile", "Profile", async () => ({ screen: (await import("./profile.js")).profileScreen })),
    item("shop", "shop", "Shop", async () => ({ screen: (await import("./shop.js")).shopScreen })),
  ]);
}
