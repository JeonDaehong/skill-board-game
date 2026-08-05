import {
  MAX_COPIES_PIECE,
  MAX_COPIES_SKILL,
  SKILLS,
  SUMMONABLE,
  isPieceCard,
  pieceCardId,
  pieceCardType,
  skillMeta,
} from "@skill/engine";
import type { PieceType } from "@skill/chess-core";

/**
 * Coins and the card collection.
 *
 * Everything lives in localStorage, which is the same place decks and settings
 * live — there is no account server yet, so "a player" means "this browser".
 * When accounts arrive this module is the seam to move behind them: every
 * screen goes through these functions rather than touching storage itself.
 *
 * Cards are identified the way the engine identifies them (`"teleport"`,
 * `"piece:n"`), so a collection entry, a deck entry and a card in hand are all
 * the same string all the way down.
 */

// ── piece cards ─────────────────────────────────────────────
export interface PieceCard {
  /** Deck/collection id, e.g. "piece:n". Its name comes from i18n's `cardName`. */
  id: string;
  type: PieceType;
  /** Sprite code under /assets/pieces — the white set reads best on a card. */
  sprite: string;
  price: number;
}

/** How many copies of one piece card a player may hold. */
export const MAX_PER_PIECE = MAX_COPIES_PIECE;
/** How many copies of one skill card a player may hold. */
export const MAX_PER_SKILL = MAX_COPIES_SKILL;

/**
 * Prices track the classical piece values (1/3/3/5/9) at 100 coins a point, so
 * the storefront teaches the value table just by being read top to bottom.
 */
export const PIECE_CARDS: PieceCard[] = [
  { id: pieceCardId("p"), type: "p", sprite: "wp", price: 100 },
  { id: pieceCardId("n"), type: "n", sprite: "wn", price: 300 },
  { id: pieceCardId("b"), type: "b", sprite: "wb", price: 300 },
  { id: pieceCardId("r"), type: "r", sprite: "wr", price: 500 },
  { id: pieceCardId("q"), type: "q", sprite: "wq", price: 900 },
];

/** The sprite for any card id, or null for skill cards (which use their art). */
export function pieceSprite(cardId: string): string | null {
  return pieceCardById(cardId)?.sprite ?? null;
}

export const pieceCardById = (id: string): PieceCard | undefined =>
  PIECE_CARDS.find((c) => c.id === id);

/** The maximum copies of `cardId` a collection may hold. */
export function collectionCap(cardId: string): number {
  return isPieceCard(cardId) ? MAX_PER_PIECE : MAX_PER_SKILL;
}

// ── storage ─────────────────────────────────────────────────
const WALLET_KEY = "skill-board:coins";
const COLLECTION_KEY = "skill-board:collection";
const PACKS_KEY = "skill-board:packs";
const GRANTED_KEY = "skill-board:starter-granted";

/**
 * Starting purse. There is no way to earn coins yet (no match rewards, no
 * season track), so a new player is staked enough to actually use the shop
 * instead of looking at a wall of unaffordable cards.
 */
const STARTING_COINS = 3000;

export function getCoins(): number {
  const raw = localStorage.getItem(WALLET_KEY);
  if (raw === null) {
    localStorage.setItem(WALLET_KEY, String(STARTING_COINS));
    return STARTING_COINS;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function setCoins(n: number): void {
  localStorage.setItem(WALLET_KEY, String(Math.max(0, Math.floor(n))));
}

/** cardId → copies owned. Only known ids with a sane count survive a read. */
export type Collection = Record<string, number>;

function knownCard(id: string): boolean {
  return isPieceCard(id) ? !!pieceCardType(id) : !!skillMeta(id);
}

export function getCollection(): Collection {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Collection = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!knownCard(id)) continue; // drop cards that no longer exist
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) out[id] = Math.min(Math.floor(n), collectionCap(id));
    }
    return out;
  } catch {
    return {};
  }
}

function saveCollection(c: Collection): void {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(c));
}

export const ownedCount = (cardId: string): number => getCollection()[cardId] ?? 0;

/** Add copies, respecting the per-card cap. Returns how many actually landed. */
export function grantCards(cardIds: string[]): number {
  const c = getCollection();
  let added = 0;
  for (const id of cardIds) {
    if (!knownCard(id)) continue;
    const have = c[id] ?? 0;
    if (have >= collectionCap(id)) continue;
    c[id] = have + 1;
    added++;
  }
  saveCollection(c);
  return added;
}

// ── card packs ──────────────────────────────────────────────
export interface CardPack {
  id: string;
  /** Art under /assets/objects. */
  art: string;
  price: number;
  /** Skill cards a pack yields. */
  size: number;
  /**
   * Weight multiplier for expensive cards. A starter pack is flat-ish and
   * mostly cheap; a premium pack tilts the same pool toward the big ones.
   */
  rareBias: number;
}

export const PACKS: CardPack[] = [
  { id: "pack-starter", art: "pack-starter", price: 1000, size: 5, rareBias: 0 },
  { id: "pack-premium", art: "pack-premium", price: 3000, size: 5, rareBias: 1 },
];

export const packById = (id: string): CardPack | undefined => PACKS.find((p) => p.id === id);

/** packId → unopened packs held. */
export type PackShelf = Record<string, number>;

export function getPacks(): PackShelf {
  try {
    const raw = localStorage.getItem(PACKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PackShelf = {};
    for (const p of PACKS) {
      const n = Number(parsed[p.id]);
      if (Number.isFinite(n) && n > 0) out[p.id] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

function savePacks(shelf: PackShelf): void {
  localStorage.setItem(PACKS_KEY, JSON.stringify(shelf));
}

export function grantPack(packId: string, count = 1): void {
  const shelf = getPacks();
  shelf[packId] = (shelf[packId] ?? 0) + count;
  savePacks(shelf);
}

/**
 * Draw weight for one skill card. Cheap cards are common and expensive ones are
 * rare, which is the whole rarity curve — there is no separate rarity field to
 * keep in sync with cost. `rareBias` flattens the curve for a premium pack.
 */
function packWeight(cost: number, rareBias: number): number {
  const base = 1 / Math.max(1, cost) ** 2;
  return base + rareBias * (cost / 5) * 0.25;
}

/**
 * Open one pack: five skill cards, drawn with replacement so a pack can hold
 * duplicates. Cards over the collection cap are still drawn and shown — they
 * simply do not increase the count, exactly like any other collection game.
 * Returns the cards drawn, or null if no such pack is held.
 */
export function openPack(packId: string, rng: () => number = Math.random): string[] | null {
  const pack = packById(packId);
  const shelf = getPacks();
  if (!pack || (shelf[packId] ?? 0) < 1) return null;

  const pool = SKILLS.map((s) => ({ id: s.id, weight: packWeight(s.cost, pack.rareBias) }));
  const total = pool.reduce((a, b) => a + b.weight, 0);

  const drawn: string[] = [];
  for (let i = 0; i < pack.size; i++) {
    let roll = rng() * total;
    // The last entry catches any floating-point shortfall, so a draw always lands.
    let picked = pool[pool.length - 1]!.id;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) {
        picked = entry.id;
        break;
      }
    }
    drawn.push(picked);
  }

  shelf[packId] = (shelf[packId] ?? 0) - 1;
  if (shelf[packId]! <= 0) delete shelf[packId];
  savePacks(shelf);
  grantCards(drawn);
  return drawn;
}

// ── the starter grant ───────────────────────────────────────
/**
 * What a brand-new account opens with: exactly the pieces a standard chess set
 * puts on the board (no king — it is never a card), plus one skill pack so the
 * first thing a player does is open something.
 */
export const STARTER_PIECES: ReadonlyArray<readonly [PieceType, number]> = [
  ["p", 8],
  ["n", 2],
  ["b", 2],
  ["r", 2],
  ["q", 1],
];

export const STARTER_PACK_ID = "pack-starter";

/**
 * Hand out the opening collection, once ever. Guarded by its own flag rather
 * than by "is the collection empty", so a player who spends or rebuilds their
 * way down to nothing is not quietly re-granted a second set.
 */
export function grantStarterIfNew(): boolean {
  if (localStorage.getItem(GRANTED_KEY)) return false;
  const cards: string[] = [];
  for (const [type, count] of STARTER_PIECES) {
    for (let i = 0; i < count; i++) cards.push(pieceCardId(type));
  }
  grantCards(cards);
  grantPack(STARTER_PACK_ID);
  localStorage.setItem(GRANTED_KEY, "1");
  return true;
}

// ── buying ──────────────────────────────────────────────────
/** Why a purchase could not go through. */
export type BuyFailure = "full" | "poor";

export type BuyResult =
  | { ok: true; owned: number; coins: number }
  | { ok: false; reason: BuyFailure };

/**
 * Buy one piece card. The cap is checked before the wallet so a player at the
 * limit is told they are full rather than being charged and silently capped.
 */
export function buyPieceCard(id: string): BuyResult {
  const card = pieceCardById(id);
  if (!card) return { ok: false, reason: "full" };

  const owned = ownedCount(id);
  if (owned >= MAX_PER_PIECE) return { ok: false, reason: "full" };

  const coins = getCoins();
  if (coins < card.price) return { ok: false, reason: "poor" };

  grantCards([id]);
  setCoins(coins - card.price);
  return { ok: true, owned: owned + 1, coins: coins - card.price };
}

/** Buy one pack. It goes on the shelf unopened, to be torn open separately. */
export function buyPack(packId: string): BuyResult {
  const pack = packById(packId);
  if (!pack) return { ok: false, reason: "full" };
  const coins = getCoins();
  if (coins < pack.price) return { ok: false, reason: "poor" };
  grantPack(packId);
  setCoins(coins - pack.price);
  return { ok: true, owned: getPacks()[packId] ?? 1, coins: coins - pack.price };
}

// ── coupons ─────────────────────────────────────────────────
/**
 * Redeemable codes. Matching is case-insensitive and ignores surrounding
 * whitespace, because a code that has been copied out of a chat window usually
 * arrives with both.
 */
const COUPONS: Record<string, { coins: number }> = {
  iloverakdos: { coins: 1_000_000 },
};

const COUPON_KEY = "skill-board:coupons";

function redeemedCoupons(): string[] {
  try {
    const raw = localStorage.getItem(COUPON_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type CouponResult =
  | { ok: true; coins: number; total: number }
  /** `unknown` = no such code, `used` = this account already redeemed it. */
  | { ok: false; reason: "unknown" | "used" };

/** Redeem a coupon code. Each code pays out once per account. */
export function redeemCoupon(input: string): CouponResult {
  const code = input.trim().toLowerCase();
  const coupon = COUPONS[code];
  if (!coupon) return { ok: false, reason: "unknown" };

  const used = redeemedCoupons();
  if (used.includes(code)) return { ok: false, reason: "used" };

  const total = getCoins() + coupon.coins;
  setCoins(total);
  try {
    localStorage.setItem(COUPON_KEY, JSON.stringify([...used, code]));
  } catch {
    /* private mode: the coins land, the record of the code does not */
  }
  return { ok: true, coins: coupon.coins, total };
}

/** Every card id a collection can contain, in a stable display order. */
export function allCardIds(): string[] {
  return [...SUMMONABLE.map(pieceCardId), ...SKILLS.map((s) => s.id)];
}

/** Thousands separators, so 1000 reads as 1,000 on a price tag. */
export const formatCoins = (n: number): string => n.toLocaleString("en-US");
