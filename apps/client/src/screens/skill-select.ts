import { el, type AppContext, type Screen } from "../router.js";
import { SKILLS, MAX_DECK_COST, skillById } from "../skills.js";
// Preserved for the upcoming card-deck system; not wired into navigation yet.
import { menuScreen } from "./menu.js";

/**
 * Pre-game skill draft. Shows all skills as cards; the player builds a deck
 * whose total cost is ≤ MAX_DECK_COST, then starts. `next` receives the chosen
 * skill ids and returns the screen to go to (e.g. countdown → game). Card art
 * is a placeholder per skill until each gets an `image` path.
 */
export function makeSkillSelect(next: (skillIds: string[]) => Screen): Screen {
  return (ctx: AppContext) => {
    const selected = new Set<string>();

    const counter = el("div", { class: "skill-counter" });
    const startBtn = el("button", {
      class: "start-btn",
      text: "Start",
      onclick: () => ctx.navigate(next([...selected])),
    }) as HTMLButtonElement;

    function usedCost(): number {
      let c = 0;
      for (const id of selected) c += skillById(id)?.cost ?? 0;
      return c;
    }

    function refresh(): void {
      const used = usedCost();
      counter.replaceChildren(
        el("span", { class: "cost-used", text: String(used) }),
        el("span", { text: ` / ${MAX_DECK_COST} Cost` }),
      );
    }

    const grid = el(
      "div",
      { class: "skill-grid" },
      SKILLS.map((skill) => {
        const art = skill.image
          ? el("div", { class: "skill-art" })
          : el("div", { class: "skill-art placeholder" }, [
              el("span", { class: "skill-art-icon", text: skill.icon }),
              el("span", { class: "skill-art-hint", text: "Art" }),
            ]);
        if (skill.image) art.style.backgroundImage = `url("${skill.image}")`;

        const tags: (Node | null)[] = [
          el("span", { class: `tag type-${skill.type}`, text: skill.type === "active" ? "Active" : "Passive" }),
          skill.cooldown ? el("span", { class: "tag cd", text: `CD ${skill.cooldown}` }) : null,
          skill.usesPerGame ? el("span", { class: "tag uses", text: `${skill.usesPerGame}×` }) : null,
        ];

        const card = el("div", { class: "skill-card" }, [
          el("div", { class: "cost-badge", text: String(skill.cost) }),
          art,
          el("div", { class: "skill-info" }, [
            el("div", { class: "skill-name", text: skill.name }),
            el("div", { class: "skill-tags" }, tags),
            el("div", { class: "skill-desc", text: skill.desc }),
          ]),
          el("div", { class: "skill-check", text: "✓" }),
        ]);

        card.onclick = () => {
          if (selected.has(skill.id)) {
            selected.delete(skill.id);
            card.classList.remove("selected");
          } else {
            if (usedCost() + skill.cost > MAX_DECK_COST) {
              // Over budget: flash the counter instead of silently ignoring.
              counter.classList.remove("bump");
              void counter.offsetWidth;
              counter.classList.add("bump");
              return;
            }
            selected.add(skill.id);
            card.classList.add("selected");
          }
          refresh();
        };
        return card;
      }),
    );

    const screen = el("div", { class: "screen skill-screen" }, [
      el("div", { class: "skill-topbar" }, [
        el("button", { class: "back-btn", text: "← Back", onclick: () => ctx.navigate(menuScreen) }),
        el("h1", { class: "screen-title", text: "Select Skills" }),
        counter,
      ]),
      grid,
      el("div", { class: "skill-actions" }, [startBtn]),
    ]);

    ctx.root.appendChild(screen);
    refresh();
  };
}
