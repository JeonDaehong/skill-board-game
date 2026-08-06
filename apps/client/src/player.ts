/**
 * Who the player is, locally. One name, stored once and read everywhere it is
 * shown — the HUD chip, the profile page, the nameplate beside the board.
 *
 * There is no account system yet, so this is the whole of a player identity:
 * the first screen of the game asks for it, and until it is answered nothing
 * else is worth showing.
 */
const KEY = "skill-board:nickname";

export const NICK_MIN = 2;
export const NICK_MAX = 16;

/** The saved name, or a stand-in for screens that must show something. */
export function getNickname(): string {
  try {
    return localStorage.getItem(KEY)?.trim() || "Player";
  } catch {
    return "Player";
  }
}

/** True once the player has actually chosen a name. */
export function hasNickname(): boolean {
  try {
    return !!localStorage.getItem(KEY)?.trim();
  } catch {
    return false;
  }
}

export function setNickname(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim().slice(0, NICK_MAX));
  } catch {
    /* private mode: the name just does not persist */
  }
}

/** Whether a typed name is usable, so the form can say so before it is sent. */
export function nicknameOk(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= NICK_MIN && trimmed.length <= NICK_MAX;
}
