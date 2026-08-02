import type { MatchState } from "@skill/engine";
import type { Color } from "@skill/chess-core";

/**
 * Produce the version of the match a given viewer is allowed to see. This is
 * where hidden information lives: the opponent's undrafted card identities are
 * masked (Foresight reveals them one at a time), and if the opponent has Cloak
 * active, their non-pawn pieces appear as pawns on the viewer's board.
 */
export function viewFor(state: MatchState, viewer: Color): MatchState {
  const v = structuredClone(state);
  const opp: Color = viewer === "w" ? "b" : "w";
  const revealed = new Set(v.players[viewer].revealed);

  // Mask the opponent's card identities (keep count + cooldown/uses shape).
  v.players[opp].deck = v.players[opp].deck.map((c, i) =>
    revealed.has(i) ? c : { ...c, id: "hidden" },
  );

  // Cloak: the opponent's real pieces look like pawns to this viewer.
  if (v.players[opp].cloakTurnsLeft > 0) {
    for (let sq = 0; sq < 64; sq++) {
      const p = v.chess.board[sq];
      if (p && p.color === opp && p.type !== "p" && p.type !== "k") {
        v.chess.board[sq] = { color: opp, type: "p" };
      }
    }
  }
  return v;
}
