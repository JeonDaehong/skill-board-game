import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";

interface ShopItem {
  icon: string;
  name: string;
  desc: string;
  price: string;
  tag?: string;
}

const ITEMS: ShopItem[] = [
  { icon: "🃏", name: "스타터 카드팩", desc: "스킬 카드 5장 랜덤", price: "1,000", tag: "곧 출시" },
  { icon: "♛", name: "골드 기물 스킨", desc: "체스 기물 프리미엄 스킨", price: "2,500", tag: "곧 출시" },
  { icon: "🎴", name: "프리미엄 카드팩", desc: "희귀 카드 확률 UP", price: "3,000", tag: "곧 출시" },
  { icon: "🖼️", name: "네온 보드 테마", desc: "보드 배경 테마", price: "1,800", tag: "곧 출시" },
  { icon: "⚡", name: "부스트 패스", desc: "경험치 2배 (7일)", price: "1,200", tag: "곧 출시" },
  { icon: "🏆", name: "시즌 패스", desc: "시즌 보상 트랙 해금", price: "4,900", tag: "곧 출시" },
];

/** 상점: pretty placeholder storefront (mock currency, all items 준비중). */
export const shopScreen: Screen = (ctx: AppContext) => {
  ctx.root.appendChild(
    el("div", { class: "screen tab-screen shop-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("div", { class: "shop-head" }, [
          el("h1", { class: "screen-title", text: "상점" }),
          el("div", { class: "glass wallet" }, [
            el("span", { class: "coin", text: "🪙" }),
            el("span", { class: "wallet-amount", text: "0" }),
          ]),
        ]),
        el("div", { class: "shop-grid" },
          ITEMS.map((it) =>
            el("div", { class: "glass shop-item" }, [
              it.tag ? el("span", { class: "item-tag", text: it.tag }) : null,
              el("div", { class: "item-icon", text: it.icon }),
              el("div", { class: "item-name", text: it.name }),
              el("div", { class: "item-desc", text: it.desc }),
              el("button", { class: "btn btn-primary btn-small btn-block price-btn" }, [
                el("span", { class: "coin", text: "🪙" }),
                el("span", { text: it.price }),
              ]),
            ]),
          ),
        ),
        el("div", { class: "coming-note", text: "상점은 준비 중입니다. 카드 덱 시스템과 함께 열립니다." }),
      ]),
      pillNav(ctx, "shop"),
    ]),
  );
};
