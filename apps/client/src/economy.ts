/**
 * Coins and the piece-card collection.
 *
 * Both live in localStorage, which is the same place decks and settings live —
 * there is no account server yet, so "a player" means "this browser". When
 * accounts arrive this module is the seam to move behind them: every screen
 * goes through these functions rather than touching storage itself.
 *
 * Piece cards are inventory only for now. Nothing in a match consumes them —
 * that hooks in when the card system lands. [[skill-system-spec]]
 */

export type PieceCardId = "pawn" | "knight" | "bishop" | "rook" | "queen";

export interface PieceCard {
  id: PieceCardId;
  /** Sprite code under /assets/pieces — the white set reads best on the card. */
  sprite: string;
  /** `[en, ko]`, matching the ordering the rest of i18n uses. */
  label: readonly [en: string, ko: string];
  price: number;
}

/** How many copies of one piece a player may hold. */
export const MAX_PER_PIECE = 50;

/**
 * Prices track the classical piece values (1/3/3/5/9) at 100 coins a point, so
 * the storefront teaches the value table just by being read top to bottom.
 */
export const PIECE_CARDS: PieceCard[] = [
  { id: "pawn", sprite: "wp", label: ["Pawn", "폰"], price: 100 },
  { id: "knight", sprite: "wn", label: ["Knight", "나이트"], price: 300 },
  { id: "bishop", sprite: "wb", label: ["Bishop", "비숍"], price: 300 },
  { id: "rook", sprite: "wr", label: ["Rook", "룩"], price: 500 },
  { id: "queen", sprite: "wq", label: ["Queen", "퀸"], price: 900 },
];

export const pieceCardById = (id: string): PieceCard | undefined =>
  PIECE_CARDS.find((c) => c.id === id);

const WALLET_KEY = "skill-board:coins";
const INVENTORY_KEY = "skill-board:pieces";

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
export type Inventory = Partial<Record<PieceCardId, number>>;

export function getInventory(): Inventory {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Inventory = {};
    for (const card of PIECE_CARDS) {
      const n = Number(parsed[card.id]);
      if (Number.isFinite(n) && n > 0) out[card.id] = Math.min(Math.floor(n), MAX_PER_PIECE);
    }
    return out;
  } catch {
    return {};
  }
}

function saveInventory(inv: Inventory): void {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv));
}

export const ownedCount = (id: PieceCardId): number => getInventory()[id] ?? 0;

/** Why a purchase could not go through. */
export type BuyFailure = "full" | "poor";

export type BuyResult =
  | { ok: true; owned: number; coins: number }
  | { ok: false; reason: BuyFailure };

/**
 * Buy one copy. The cap is checked before the wallet so a player at 50 is told
 * they are full rather than being charged and silently capped.
 */
export function buyPieceCard(id: PieceCardId): BuyResult {
  const card = pieceCardById(id);
  if (!card) return { ok: false, reason: "full" };

  const inv = getInventory();
  const owned = inv[id] ?? 0;
  if (owned >= MAX_PER_PIECE) return { ok: false, reason: "full" };

  const coins = getCoins();
  if (coins < card.price) return { ok: false, reason: "poor" };

  inv[id] = owned + 1;
  saveInventory(inv);
  setCoins(coins - card.price);
  return { ok: true, owned: inv[id]!, coins: coins - card.price };
}

/** Thousands separators, so 1000 reads as 1,000 on a price tag. */
export const formatCoins = (n: number): string => n.toLocaleString("en-US");
