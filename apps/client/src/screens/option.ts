import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import { formatCoins, redeemCoupon } from "../economy.js";
import { getLang, setLang, t, type Lang } from "../i18n.js";

/** Placeholder options screen — settings get wired up as features land. */
export const optionScreen: Screen = (ctx: AppContext) => {
  const row = (label: string, control: Node) =>
    el("div", { class: "option-row" }, [el("span", { text: label }), control]);

  /** Switching language rebuilds this screen, so the labels follow immediately. */
  const langPick = el("div", { class: "lang-pick" },
    ([["en", "English"], ["ko", "한국어"]] as [Lang, string][]).map(([code, label]) =>
      el("button", {
        class: `chip lang-chip${getLang() === code ? " active" : ""}`,
        text: label,
        onclick: () => {
          if (getLang() === code) return;
          setLang(code);
          ctx.reload();
        },
      }),
    ),
  );

  // ── coupon redemption ──────────────────────────────────────
  const couponInput = el("input", { class: "field-input coupon-input" }) as HTMLInputElement;
  couponInput.placeholder = t("option.couponPlaceholder");
  couponInput.maxLength = 24;
  couponInput.autocapitalize = "off";
  couponInput.spellcheck = false;
  const couponNote = el("div", { class: "coupon-note" });

  function redeem(): void {
    const res = redeemCoupon(couponInput.value);
    couponNote.className = `coupon-note ${res.ok ? "ok" : "bad"}`;
    if (res.ok) {
      couponNote.textContent = t("option.couponOk")
        .replace("{coins}", formatCoins(res.coins))
        .replace("{total}", formatCoins(res.total));
      couponInput.value = "";
    } else {
      couponNote.textContent = res.reason === "used" ? t("option.couponUsed") : t("option.couponBad");
    }
  }
  couponInput.onkeydown = (e) => { if (e.key === "Enter") redeem(); };

  const couponRow = el("div", { class: "option-row coupon-row" }, [
    el("span", { text: t("option.coupon") }),
    el("div", { class: "coupon-entry" }, [
      couponInput,
      el("button", { class: "btn btn-primary btn-small", text: t("option.couponRedeem"), onclick: () => redeem() }),
    ]),
  ]);

  const screen = el("div", { class: "screen option-screen" }, [
    el("h1", { class: "screen-title", text: t("option.title") }),
    el("div", { class: "option-list" }, [
      row(t("option.sound"), el("span", { class: "chip", text: t("option.comingSoon") })),
      row(t("option.boardTheme"), el("span", { class: "chip", text: "Classic" })),
      row(t("option.language"), langPick),
      couponRow,
      couponNote,
    ]),
    el("button", { class: "back-btn", text: t("common.back"), onclick: () => ctx.navigate(menuScreen) }),
  ]);
  ctx.root.appendChild(screen);
};
