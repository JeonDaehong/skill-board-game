/**
 * Cosmetics: chess piece sets and board materials.
 *
 * A skin owns no rules — it only changes which sprite sheet the renderer reads
 * and which two textures the squares are painted with, so nothing here can
 * affect a match. Ownership lives beside the card collection in localStorage;
 * what is equipped is a separate key, because selling a skin and wearing it are
 * different decisions and the shop should not silently dress you.
 *
 * The art is generated separately (see docs/skin-prompts.md) and may not exist
 * yet. That is deliberately survivable: the renderer loads the default set
 * first and only overwrites the files a skin actually provides, so equipping a
 * skin whose sheet has not been drawn yet leaves the board looking exactly as it
 * did rather than leaving it blank.
 */

/** The default set. Its files sit directly in the asset folders, not in a subfolder. */
export const DEFAULT_PIECE_SKIN = "classic";
export const DEFAULT_BOARD_THEME = "classic";

export interface PieceSkin {
  id: string;
  /**
   * Folder under `assets/pieces/` holding this set's twelve sprites, or null for
   * the default set, which lives at the top of that folder.
   */
  folder: string | null;
  /** Shop price in coins. 0 = owned from the start and never sold. */
  price: number;
  /** Shop tile art. Falls back to a stand-in until the skin's own icon exists. */
  art: string;
}

export interface BoardTheme {
  id: string;
  /** Folder under `assets/textures/`, or null for the default pair. */
  folder: string | null;
  price: number;
  art: string;
  /**
   * The two square textures, by file name. The default pair is not a matched set
   * — it was picked from a general texture sheet — so it names its files while
   * every theme uses the same two.
   */
  light: string;
  dark: string;
}

export const PIECE_SKINS: PieceSkin[] = [
  { id: DEFAULT_PIECE_SKIN, folder: null, price: 0, art: "chess" },
  { id: "demon", folder: "demon", price: 2500, art: "queen-gold" },
  { id: "angel", folder: "angel", price: 2500, art: "queen-gold" },
  { id: "ossuary", folder: "ossuary", price: 3200, art: "queen-gold" },
];

export const BOARD_THEMES: BoardTheme[] = [
  { id: DEFAULT_BOARD_THEME, folder: null, price: 0, art: "chess", light: "stone-light", dark: "wood-dark" },
  { id: "arcane", folder: "arcane", price: 1800, art: "theme-board", light: "light", dark: "dark" },
  { id: "marble", folder: "marble", price: 1800, art: "theme-board", light: "light", dark: "dark" },
  { id: "sandstone", folder: "sandstone", price: 2200, art: "theme-board", light: "light", dark: "dark" },
];

export const pieceSkin = (id: string): PieceSkin =>
  PIECE_SKINS.find((s) => s.id === id) ?? PIECE_SKINS[0]!;
export const boardTheme = (id: string): BoardTheme =>
  BOARD_THEMES.find((s) => s.id === id) ?? BOARD_THEMES[0]!;

/** Every skin id, both kinds. Used to validate what comes out of storage. */
const KNOWN = new Set([...PIECE_SKINS, ...BOARD_THEMES].map((s) => s.id));

/** A skin that costs nothing is owned by everyone; there is nothing to sell. */
export const isFreeSkin = (id: string): boolean =>
  [...PIECE_SKINS, ...BOARD_THEMES].some((s) => s.id === id && s.price === 0);

// ── ownership ───────────────────────────────────────────────
const OWNED_KEY = "skill-board:skins";
const PIECE_KEY = "skill-board:skin:pieces";
const BOARD_KEY = "skill-board:skin:board";

function readOwned(): Set<string> {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    // Drop ids that no longer exist, the same way the card collection does.
    return new Set(parsed.filter((id): id is string => typeof id === "string" && KNOWN.has(id)));
  } catch {
    return new Set();
  }
}

function writeOwned(owned: Set<string>): void {
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify([...owned]));
  } catch {
    /* private mode: the purchase just does not persist */
  }
}

export function ownsSkin(id: string): boolean {
  return isFreeSkin(id) || readOwned().has(id);
}

export function grantSkin(id: string): void {
  if (!KNOWN.has(id) || isFreeSkin(id)) return;
  const owned = readOwned();
  owned.add(id);
  writeOwned(owned);
}

/** Price of a skin, or null if there is no such skin. */
export function skinPrice(id: string): number | null {
  const found = [...PIECE_SKINS, ...BOARD_THEMES].find((s) => s.id === id);
  return found ? found.price : null;
}

// ── what is being worn ──────────────────────────────────────
/**
 * Reading falls back to the default whenever the stored id is unknown *or* no
 * longer owned. Wearing something you do not own is the one state that must not
 * survive a reload — otherwise clearing the collection leaves you in it forever.
 */
function readEquipped(key: string, fallback: string, valid: (id: string) => boolean): string {
  try {
    const id = localStorage.getItem(key);
    if (id && valid(id) && ownsSkin(id)) return id;
  } catch {
    /* fall through to the default */
  }
  return fallback;
}

export const getPieceSkin = (): string =>
  readEquipped(PIECE_KEY, DEFAULT_PIECE_SKIN, (id) => PIECE_SKINS.some((s) => s.id === id));
export const getBoardTheme = (): string =>
  readEquipped(BOARD_KEY, DEFAULT_BOARD_THEME, (id) => BOARD_THEMES.some((s) => s.id === id));

export function setPieceSkin(id: string): void {
  if (!ownsSkin(id) || !PIECE_SKINS.some((s) => s.id === id)) return;
  try { localStorage.setItem(PIECE_KEY, id); } catch { /* private mode */ }
}

export function setBoardTheme(id: string): void {
  if (!ownsSkin(id) || !BOARD_THEMES.some((s) => s.id === id)) return;
  try { localStorage.setItem(BOARD_KEY, id); } catch { /* private mode */ }
}

// ── asset paths ─────────────────────────────────────────────
/** Where a piece sprite lives for this skin. */
export function skinPieceUrl(code: string, skinId = getPieceSkin()): string {
  const folder = pieceSkin(skinId).folder;
  return folder ? `/assets/pieces/${folder}/${code}.png` : `/assets/pieces/${code}.png`;
}

/** The two square textures for this theme, as `[lightUrl, darkUrl]`. */
export function themeTextureUrls(themeId = getBoardTheme()): [string, string] {
  const theme = boardTheme(themeId);
  const dir = theme.folder ? `/assets/textures/${theme.folder}` : "/assets/textures";
  return [`${dir}/${theme.light}.png`, `${dir}/${theme.dark}.png`];
}
