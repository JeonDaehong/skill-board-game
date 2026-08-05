import {
  cardCost,
  isPieceCard,
  modeRules,
  pieceCardType,
  skillMeta,
  summonZone,
  type Action,
  type MatchState,
} from "@skill/engine";
import type { Color } from "@skill/chess-core";

/**
 * The AI's card policy.
 *
 * It is deliberately conservative: playing a skill card badly is worse than not
 * playing it, and evaluating skill effects properly is a search problem of its
 * own. So the AI only takes actions that cannot lose it tempo —
 *
 *   - it summons in master mode, because a mode where the AI never builds an
 *     army is not a mode;
 *   - it plays 속공 cards that need no target, since those are free by
 *     definition — they do not cost the piece move;
 *   - it answers a counter window only when the action was actually worth
 *     answering (a capture, or a check);
 *   - and it passes everything else.
 *
 * Returns the next action the AI wants to take, or null when it is done with
 * the current step and the caller should let it move.
 */
export function aiCardAction(state: MatchState, me: Color): Action | null {
  const cfg = modeRules(state.mode);
  if (cfg.deckSize === 0) return null; // classic: nothing to decide
  const p = state.players[me];

  // ── a step is waiting on us ───────────────────────────────
  if (state.pending) {
    const pending = state.pending;
    if (pending.color !== me) return null;

    switch (pending.kind) {
      case "draw-choice":
        // Cards are only useful once they can be paid for; take the draw and
        // throw away whatever is furthest out of reach.
        return { type: "draw-take" };

      case "discard": {
        let worst = 0;
        for (let i = 1; i < p.hand.length; i++) {
          if (cardCost(p.hand[i]!) > cardCost(p.hand[worst]!)) worst = i;
        }
        return { type: "discard", index: worst };
      }

      case "counter": {
        const worthIt =
          pending.trigger === "capture" ||
          pending.trigger === "check" ||
          pending.trigger === "checkmate" ||
          pending.trigger === "terrain";
        if (worthIt) {
          const i = p.hand.findIndex((id) => {
            const m = skillMeta(id);
            return m?.speed === "counter" && m.trigger === pending.trigger && p.cost >= m.cost;
          });
          if (i >= 0) return { type: "counter-play", index: i };
        }
        return { type: "counter-pass" };
      }

      case "summon-place": {
        const zone = summonZone(state, me);
        if (zone.length === 0) return null;
        // Summon onto the back rank where possible: it is the square least
        // likely to be in the way of the pieces already developed.
        return { type: "summon-place", sq: zone[0]! };
      }

      default:
        return null; // multi-step skills the AI never starts
    }
  }

  // ── our own turn, step by step ────────────────────────────
  if (state.chess.turn !== me) return null;

  if (state.phase === "summon") {
    const i = bestSummon(p.hand, p.cost);
    if (i >= 0 && summonZone(state, me).length > 0) return { type: "summon", index: i };
    return { type: "pass-phase" };
  }

  if (state.phase === "skill") {
    const i = p.hand.findIndex((id) => {
      const m = skillMeta(id);
      return m?.speed === "quick" && FREE_QUICK.has(id) && p.cost >= m.cost;
    });
    if (i >= 0) return { type: "play-skill", index: i };
    return { type: "pass-phase" };
  }

  return null; // move phase: the search takes it from here
}

/**
 * 속공 cards that resolve on their own, with nothing to aim at, and whose
 * effect is good for whoever plays it. Anything that needs a target needs
 * judgement about the target, which is the part the AI does not have yet.
 */
const FREE_QUICK = new Set(["meditate", "readiness", "spy", "clairvoyance"]);

/** The most expensive piece card the pool can currently pay for. */
function bestSummon(hand: string[], cost: number): number {
  let best = -1;
  let bestCost = 0;
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i]!;
    if (!isPieceCard(id) || !pieceCardType(id)) continue;
    const c = cardCost(id);
    if (c <= cost && c > bestCost) {
      best = i;
      bestCost = c;
    }
  }
  return best;
}
