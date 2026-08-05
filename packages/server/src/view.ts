import type { MatchState } from "@skill/engine";
import type { Color } from "@skill/chess-core";

/** Stand-in id for a card the viewer is not entitled to see. */
export const HIDDEN_CARD = "hidden";

/**
 * Produce the version of the match a given viewer is allowed to see. This is
 * where hidden information lives.
 *
 * The opponent's hand is masked card by card — 정찰 and 첩보 reveal them one at
 * a time, so the array keeps its length and its order and only the identities
 * go. Their library is masked wholesale: its order is the next few draws, and
 * knowing it would be a bigger leak than seeing the hand. Their discard pile is
 * public, exactly as it is across the table.
 */
export function viewFor(state: MatchState, viewer: Color): MatchState {
  const v = structuredClone(state);
  const opp: Color = viewer === "w" ? "b" : "w";
  const revealed = new Set(v.players[viewer].revealed);

  v.players[opp].hand = v.players[opp].hand.map((id, i) =>
    revealed.has(i) ? id : HIDDEN_CARD,
  );
  v.players[opp].library = v.players[opp].library.map(() => HIDDEN_CARD);
  // What they peeked at with 밀정, and which of our cards they have seen, is
  // their business and not ours to render.
  v.players[opp].seenTop = null;
  v.players[opp].revealed = [];

  // A counter window carries the action being answered, which is fine — but if
  // it is the opponent's own pending step, the card they might play is not.
  if (v.pending?.kind === "summon-place" && v.pending.color === opp) {
    v.pending = { ...v.pending, card: HIDDEN_CARD };
  }

  // 지뢰 is buried: the viewer only learns where the opponent's mines are by
  // stepping on one.
  v.enchants = v.enchants.filter(
    (e) => !(e.card === "mine" && e.owner === opp && e.data?.hidden === 1),
  );

  // 환각: the side it was played on sees every piece as a pawn.
  if (v.players[opp].lasting.some((l) => l.card === "hallucination")) {
    for (let sq = 0; sq < v.chess.board.length; sq++) {
      const p = v.chess.board[sq];
      if (p && p.type !== "p" && p.type !== "k") {
        v.chess.board[sq] = { color: p.color, type: "p" };
      }
    }
  }
  return v;
}
