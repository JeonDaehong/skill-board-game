import {
  applyMove,
  cloneState,
  fileOf,
  findKing,
  generateLegalMoves,
  getStatus,
  isInCheck,
  makeSquare,
  onBoard,
  opposite,
  rankOf,
  type Color,
  type Piece,
  type PieceType,
  type Square,
} from "@skill/chess-core";
import { skillMeta, type CounterTrigger, type SkillMeta, type TargetSpec } from "./skills.js";
import { SUMMON_COST, isPieceCard, pieceCardType } from "./cards.js";
import { modeRules, usesCards } from "./modes.js";
import {
  addEnchant,
  beginTurn,
  cloneMatch,
  deriveRules,
  drawCard,
  endEnchant,
  endGame,
  enchantsOn,
  nextPhase,
  onOpponentDrew,
  runDrawStep,
  shuffle,
} from "./match.js";
import type {
  Action,
  Enchant,
  MatchEvent,
  MatchState,
  Pending,
  Pick,
  PlayerState,
  ReduceResult,
  Rng,
} from "./types.js";

function fail(error: string): ReduceResult {
  return { ok: false, error };
}

const NEIGHBORS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];
const LINES: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// ── cost ────────────────────────────────────────────────────
/**
 * What a card actually costs this player right now. 절약 shaves one off every
 * card you play (never below 1) and 흙탕물 adds one to everything the opponent
 * plays; both are printed on the card as modifiers to the printed cost, so the
 * arithmetic lives in one place rather than at each call site.
 */
export function cardCost(cardId: string, s?: MatchState, color?: Color): number {
  const piece = pieceCardType(cardId);
  const base = piece ? SUMMON_COST[piece] : skillMeta(cardId)?.cost ?? 0;
  if (!s || !color) return base;
  let cost = base;
  if (s.players[color].lasting.some((l) => l.card === "thrift")) cost = Math.max(1, cost - 1);
  if (s.players[opposite(color)].lasting.some((l) => l.card === "muddy-water")) cost += 1;
  return cost;
}

/** Cost available to spend: the bank plus whatever this turn granted. */
function purse(p: PlayerState): number {
  return p.cost + p.bonusCost;
}

function pay(p: PlayerState, amount: number): void {
  const fromBonus = Math.min(p.bonusCost, amount);
  p.bonusCost -= fromBonus;
  p.cost -= amount - fromBonus;
}

/**
 * Grant cost for this turn only (준비 태세, the gambling den's better rolls),
 * up to the pool's ceiling. docs/skill.md prints the rule under the den's table
 * — "코스트는 10을 초과할 수 없음" — and it is the pool it caps, not the grant:
 * +3 on a full bank used to hand out thirteen spendable cost.
 */
function grantCost(s: MatchState, color: Color, n: number): void {
  const p = s.players[color];
  const room = modeRules(s.mode).costCap - p.cost;
  p.bonusCost = Math.max(0, Math.min(p.bonusCost + n, room));
}

export function canAfford(p: PlayerState, cardId: string, s?: MatchState): boolean {
  return purse(p) >= cardCost(cardId, s, p.color);
}

function cardsAllowed(s: MatchState): boolean {
  return usesCards(s.mode);
}

/** Playing a card is legal during the summon and skill steps of your own turn. */
function inCardPhase(s: MatchState): boolean {
  return s.phase === "summon" || s.phase === "skill";
}

// ── board helpers ───────────────────────────────────────────
/** The up-to-eight squares touching `sq`. Exported because the client needs the
 *  same ring to honour a spec's `nextTo` rather than re-deriving adjacency. */
export function neighborsOf(s: MatchState, sq: Square): Square[] {
  const { chess } = s;
  const f = fileOf(sq, chess);
  const r = rankOf(sq, chess);
  const out: Square[] = [];
  for (const [df, dr] of NEIGHBORS) {
    if (onBoard(f + df, r + dr, chess)) out.push(makeSquare(f + df, r + dr, chess));
  }
  return out;
}

/** Step from `a` toward `b` if they share a rank, file or diagonal. */
function lineStep(s: MatchState, a: Square, b: Square): [number, number] | null {
  const { chess } = s;
  const df = fileOf(b, chess) - fileOf(a, chess);
  const dr = rankOf(b, chess) - rankOf(a, chess);
  if (df === 0 && dr === 0) return null;
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
  return [Math.sign(df), Math.sign(dr)];
}

/** Move whatever is attached to `from` along with the piece that left it. */
function followSquare(s: MatchState, from: Square, to: Square): void {
  for (const e of s.enchants) {
    if (e.on.kind !== "player" && e.on.sq === from && e.on.kind === "piece") e.on.sq = to;
    if (e.data && typeof e.data.partner === "number" && e.data.partner === from) e.data.partner = to;
  }
  for (const color of ["w", "b"] as Color[]) {
    const p = s.players[color];
    const i = p.summonSick.indexOf(from);
    if (i >= 0) p.summonSick[i] = to;
    if (p.doubleMove?.sq === from) p.doubleMove.sq = to;
  }
}

/**
 * Take a piece off the board and run everything that watches for a death: the
 * bait it was carrying, the beacon that lights on any loss, and the chain that
 * drags its partner down with it.
 */
function destroyPiece(
  s: MatchState,
  sq: Square,
  events: MatchEvent[],
  rng: Rng,
  depth = 0,
): void {
  const piece = s.chess.board[sq];
  if (!piece) return;
  s.chess.board[sq] = null;
  const owner = piece.color;
  events.push({ type: "slain", color: owner, sq, piece: piece.type });

  const attached = enchantsOn(s, sq);
  s.enchants = s.enchants.filter((e) => e.on.kind === "player" || e.on.sq !== sq);

  for (const p of ["w", "b"] as Color[]) {
    const ps = s.players[p];
    ps.summonSick = ps.summonSick.filter((x) => x !== sq);
    if (ps.doubleMove?.sq === sq) ps.doubleMove = null;
  }

  // 미끼: the pawn was worth two cards to whoever set the trap.
  for (const e of attached) {
    if (e.card === "bait") drawFor(s, e.owner, 2, events, rng);
    // 운명의 사슬: whatever it was tied to goes too.
    if (e.card === "fate-chain" && depth < 4) {
      const partner = typeof e.data?.partner === "number" ? e.data.partner : null;
      if (partner !== null) destroyPiece(s, partner, events, rng, depth + 1);
    }
  }

  // 봉화: the owner draws for every piece of theirs that falls.
  if (s.players[owner].lasting.some((l) => l.card === "beacon")) {
    drawFor(s, owner, 1, events, rng);
  }
}

/**
 * Keep 정찰's notes pointing at the cards they were taken on.
 *
 * `revealed` is a list of positions in the opponent's hand, and a hand
 * renumbers itself the moment a card leaves it. Scouting their third card and
 * then watching them play their first left the third card's note sitting on
 * what used to be their fourth — so the rail showed a card face up that had
 * never been looked at, and hid the one that had. Call this with the index that
 * just left `owner`'s hand.
 */
function forgetRevealed(s: MatchState, owner: Color, index: number): void {
  const watcher = s.players[opposite(owner)];
  watcher.revealed = watcher.revealed
    .filter((i) => i !== index)
    .map((i) => (i > index ? i - 1 : i));
}

/** Draw up to `n` cards, respecting the hand cap. */
function drawFor(s: MatchState, color: Color, n: number, events: MatchEvent[], rng: Rng): number {
  const cap = modeRules(s.mode).handCap;
  const p = s.players[color];
  let drawn = 0;
  for (let i = 0; i < n && p.hand.length < cap; i++) {
    const card = drawCard(p, rng);
    if (!card) break;
    p.hand.push(card);
    events.push({ type: "drew", color, card });
    onOpponentDrew(s, color, events, rng);
    drawn++;
  }
  return drawn;
}

// ── turn / ending ───────────────────────────────────────────
function endTurn(state: MatchState, acting: Color, events: MatchEvent[], rng: Rng): void {
  const opp = opposite(acting);
  state.chess = { ...state.chess, turn: opp };
  beginTurn(state, opp, events, rng);
  runTurnStartCards(state, opp, events, rng);
  state.rules = deriveRules(state);
  resolveEnding(state, events);
}

/**
 * 지속 cards that fire at the start of a turn: the plague that eats a pawn
 * every third turn, and the gambling den's dice.
 */
function runTurnStartCards(s: MatchState, color: Color, events: MatchEvent[], rng: Rng): void {
  if (s.status === "ended") return;

  for (const owner of ["w", "b"] as Color[]) {
    for (const l of s.players[owner].lasting) {
      if (l.card !== "plague") continue;
      // "각 플레이어는 자신 턴 기준 3턴마다": the count is per side, and it is
      // kept out of `turnsLeft` so the expiry sweep never mistakes it for one.
      l.cycle = { ...l.cycle, [color]: (l.cycle?.[color] ?? 0) + 1 };
      if (l.cycle[color]! % 3 !== 0) continue;
      const pawns: Square[] = [];
      for (let sq = 0; sq < s.chess.board.length; sq++) {
        const p = s.chess.board[sq];
        if (p && p.color === color && p.type === "p") pawns.push(sq);
      }
      const victim = pawns[Math.floor(rng() * pawns.length)];
      if (victim !== undefined) {
        destroyPiece(s, victim, events, rng);
        events.push({ type: "toast", text: "fx.plague" });
      }
    }
  }

  if (!s.players.w.lasting.some((l) => l.card === "gambling-den") &&
      !s.players.b.lasting.some((l) => l.card === "gambling-den")) {
    return;
  }
  const roll = Math.floor(rng() * 6) + 1;
  events.push({ type: "dice", color, value: roll });
  const p = s.players[color];
  const cap = modeRules(s.mode).costCap;
  if (roll <= 2) {
    const mine: Square[] = [];
    for (let sq = 0; sq < s.chess.board.length; sq++) {
      const pc = s.chess.board[sq];
      if (pc && pc.color === color && pc.type !== "k") mine.push(sq);
    }
    const victim = mine[Math.floor(rng() * mine.length)];
    if (victim !== undefined) destroyPiece(s, victim, events, rng);
    events.push({ type: "toast", text: "fx.denPiece" });
  } else if (roll === 3) {
    const card = p.hand.shift();
    if (card) p.library.unshift(card);
    events.push({ type: "toast", text: "fx.denBottom" });
  } else if (roll === 4) {
    // The choice between cost and a card is not worth a whole prompt step;
    // a full hand takes the cost, otherwise the card is the better gift.
    if (p.hand.length >= modeRules(s.mode).handCap) p.cost = Math.min(cap, p.cost + 1);
    else drawFor(s, color, 1, events, rng);
  } else {
    if (p.hand.length >= modeRules(s.mode).handCap) grantCost(s, color, 3);
    else drawFor(s, color, 2, events, rng);
  }
}

function resolveEnding(state: MatchState, events: MatchEvent[]): void {
  if (state.status === "ended" || state.pending) return;
  const st = getStatus(state.chess, state.rules);
  if (st === "checkmate") {
    endGame(state, events, opposite(state.chess.turn), "checkmate");
  } else if (st === "stalemate" || st.startsWith("draw")) {
    endGame(state, events, "draw", st);
  }
}

// ── counter windows ─────────────────────────────────────────
/**
 * Who gets the window. Normally the player the action is aimed at — but a piece
 * walking onto a mine is its owner's problem, and they are the one holding 방어.
 */
function counterResponder(acting: Color, action: Action): Color {
  return action.type === "terrain" ? action.victim : opposite(acting);
}

/**
 * Which of the opponent's held cards this action could be answered with.
 * Nothing opens a window in classic mode or when the responder cannot pay — an
 * unanswerable prompt is only a delay.
 */
function counterTriggers(s: MatchState, acting: Color, action: Action): CounterTrigger[] {
  if (!cardsAllowed(s)) return [];
  const responder = s.players[counterResponder(acting, action)];
  if (responder.hand.length === 0) return [];

  const triggers: CounterTrigger[] = [];
  if (action.type === "move") {
    triggers.push("move");
    const chosen = generateLegalMoves(s.chess, action.from, s.rules).find((m) => m.to === action.to);
    if (chosen?.captured) triggers.push("capture");
    if (chosen) {
      const after = { ...applyMove(s.chess, chosen), turn: opposite(acting) };
      if (isInCheck(after, opposite(acting), s.rules)) {
        triggers.push("check");
        if (getStatus(after, s.rules) === "checkmate") triggers.push("checkmate");
      }
    }
  } else if (action.type === "summon-place") {
    triggers.push("summon");
  } else if (action.type === "play-skill") {
    triggers.push("skill");
    const card = s.players[acting].hand[action.index];
    if (card && skillMeta(card)?.type === "enchant") triggers.push("enchant");
  } else if (action.type === "terrain") {
    triggers.push("terrain");
  }
  if (triggers.length === 0) return [];

  return triggers
    .filter((t) =>
      responder.hand.some((id) => {
        const m = skillMeta(id);
        return m?.speed === "counter" && m.trigger === t && purse(responder) >= cardCost(id, s, responder.color);
      }),
    )
    .sort((a, b) => TRIGGER_URGENCY.indexOf(a) - TRIGGER_URGENCY.indexOf(b));
}

/**
 * One action can open several windows at once — a capture that is also a mate —
 * but only one is offered, so it has to be the one worth answering. Most
 * specific first: nothing outranks the mate that ends the game.
 */
const TRIGGER_URGENCY: CounterTrigger[] = [
  "checkmate", "check", "terrain", "capture", "enchant", "skill", "summon", "move",
];

/** Which piece 보디가드 spends, cheapest first. */
const GUARD_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

// ── main reducer ────────────────────────────────────────────
export function reduce(prev: MatchState, action: Action, rng: Rng = Math.random): ReduceResult {
  if (prev.status === "ended") return fail("match already ended");

  const s = cloneMatch(prev);
  const events: MatchEvent[] = [];

  // A flag fall ends the match wherever it lands, including mid-skill.
  if (action.type === "flag") {
    const loser = s.pending ? s.pending.color : s.chess.turn;
    endGame(s, events, opposite(loser), "timeout");
    return { ok: true, state: s, events };
  }

  if (s.pending) return reducePending(s, action, events, rng);

  const triggers = counterTriggers(s, s.chess.turn, action);
  if (triggers.length > 0) {
    s.pending = {
      kind: "counter",
      color: counterResponder(s.chess.turn, action),
      trigger: triggers[0]!,
      action,
      chain: 0,
    };
    events.push({ type: "toast", text: "fx.counterWindow" });
    return { ok: true, state: s, events };
  }

  return applyAction(s, action, events, rng);
}

/** A fixed stream for probe reductions, whose results are all thrown away. */
const PROBE_RNG: Rng = () => 0.5;

/**
 * Every square the pending targeting step would actually accept.
 *
 * Answered by trying it. `reduce` clones before it touches anything, so the
 * cheapest way to know whether a pick lands is to make it on a copy and look at
 * the answer — which makes this correct by construction for all sixty-three
 * cards, including the ones whose rule is not about the square at all (밀쳐내기
 * needs somewhere to shove them *to*; 끌어당기기 needs a clear line and room in
 * front).
 *
 * The alternative is a second copy of each card's rule living in the UI, and
 * that copy drifts. It already had: the board offered 질주 every empty square on
 * it, the reducer refused all but the eight beside the piece, and the refusal
 * was not shown — so the card looked like it did nothing.
 */
export function targetOptions(s: MatchState): Square[] {
  const p = s.pending;
  if (!p || p.kind !== "targeting") return [];
  const spec = skillMeta(p.card)?.targets?.[p.step];
  if (!spec) return [];
  // Steps answered off-board (a card in hand, one of a fixed set of answers)
  // have no squares to light up.
  const wantsSquare = spec.kinds.some(
    (k) => k === "own-piece" || k === "enemy-piece" || k === "empty",
  );
  if (!wantsSquare) return [];

  const out: Square[] = [];
  for (let sq = 0; sq < s.chess.board.length; sq++) {
    if (reduce(s, { type: "target", sq }, PROBE_RNG).ok) out.push(sq);
  }
  return out;
}

/** Apply an action that has already cleared (or bypassed) the counter window. */
function applyAction(
  s: MatchState,
  action: Action,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const acting: Color = s.chess.turn;

  switch (action.type) {
    case "resign":
      endGame(s, events, opposite(acting), "resign");
      break;

    case "flag":
      endGame(s, events, opposite(acting), "timeout");
      break;

    case "pass-phase": {
      if (!cardsAllowed(s)) return fail("no phases in classic mode");
      if (s.phase === "move") return fail("nothing left to pass");
      s.phase = nextPhase(s, s.phase);
      break;
    }

    case "end-turn": {
      if (!cardsAllowed(s)) return fail("classic mode ends its turn by moving");
      endTurn(s, acting, events, rng);
      break;
    }

    case "draw": {
      if (!cardsAllowed(s)) return fail("classic mode has no draw step");
      if (s.phase !== "draw") return fail("not the draw step");
      // A hand already at the cap turns this into a decision rather than a
      // draw; runDrawStep leaves the `draw-choice` pending for that.
      runDrawStep(s, acting, events, rng);
      break;
    }

    case "draw-skip":
    case "draw-take":
    case "discard":
    case "arrange":
    case "counter-play":
    case "counter-pass":
    case "summon-place":
    case "target":
    case "target-done":
    case "target-cancel":
    case "free-move":
    case "free-move-end":
      return fail(`${action.type} is only valid while that step is pending`);

    case "summon": {
      if (!modeRules(s.mode).pieceCards) return fail("this mode has no piece cards");
      if (s.phase !== "summon") return fail("summoning happens before skills");
      const p = s.players[acting];
      const card = p.hand[action.index];
      if (!card || !isPieceCard(card)) return fail("not a piece card");
      const piece = pieceCardType(card);
      if (!piece) return fail("unknown piece card");
      const price = cardCost(card, s, acting);
      if (purse(p) < price) return fail("not enough cost");
      if (summonZone(s, acting).length === 0) return fail("no room to summon");
      pay(p, price);
      p.hand.splice(action.index, 1);
      forgetRevealed(s, acting, action.index);
      s.pending = { kind: "summon-place", color: acting, piece, card };
      break;
    }

    case "play-skill":
      return playSkill(s, acting, action.index, events, rng);

    case "terrain": {
      applyTerrain(s, action.sq, action.victim, action.card, events, rng);
      s.rules = deriveRules(s);
      resolveEnding(s, events);
      break;
    }

    case "move": {
      if (cardsAllowed(s)) {
        // Pieces move on the move step and nowhere else. Letting a move slip
        // out of the summon or skill step made the phase track a decoration:
        // you could skip the whole turn structure by clicking the board.
        if (s.phase !== "move") return fail("not the move step");
        if (s.moveSpent && s.players[acting].doubleMove?.sq !== action.from) {
          return fail("a card was played instead of your move this turn");
        }
      }
      return doMove(s, acting, action.from, action.to, action.promotion, events, rng);
    }

    default: {
      const _e: never = action;
      return fail(`unhandled action: ${JSON.stringify(_e)}`);
    }
  }

  return { ok: true, state: s, events };
}

/**
 * Where a summoned piece may land: any empty square on your own back three
 * ranks. Deep enough to be a real reinforcement, shallow enough that it can
 * never be dropped behind the enemy line.
 */
export function summonZone(s: MatchState, color: Color): Square[] {
  const { chess } = s;
  const out: Square[] = [];
  for (let rank = 0; rank < 3; rank++) {
    const r = color === "w" ? rank : chess.height - 1 - rank;
    for (let f = 0; f < chess.width; f++) {
      const sq = makeSquare(f, r, chess);
      if (!chess.board[sq]) out.push(sq);
    }
  }
  return out;
}

// ── moving a piece ──────────────────────────────────────────
function doMove(
  s: MatchState,
  acting: Color,
  from: Square,
  to: Square,
  promotion: PieceType | undefined,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const legal = generateLegalMoves(s.chess, from, s.rules).filter((m) => m.to === to);
  const chosen = legal.find((m) => !m.promotion || m.promotion === (promotion ?? "q"));
  if (!chosen) return fail("illegal move");

  // Read this before the move: `followSquare` re-keys it onto the destination,
  // and the question here is which piece was told to move twice.
  const doubling = s.players[acting].doubleMove?.sq === chosen.from;
  const captured = chosen.captured ?? null;
  s.undo = {
    mover: acting,
    chess: cloneState(s.chess),
    captured: captured && captured.color !== acting ? captured.type : null,
    from: chosen.from,
    to: chosen.to,
  };
  // A capture is a death like any other, so it runs the death hooks before the
  // board changes under them.
  if (captured && captured.color !== acting) {
    destroyPiece(s, victimSquare(s, chosen.from, chosen.to)!, events, rng);
  }
  s.chess = applyMove(s.chess, chosen);
  followSquare(s, chosen.from, chosen.to);

  // 더블: the same piece gets a second move before the turn passes on.
  const dm = s.players[acting].doubleMove;
  if (dm && doubling && dm.movesLeft > 1) {
    s.players[acting].doubleMove = { sq: chosen.to, movesLeft: dm.movesLeft - 1 };
    s.chess = { ...s.chess, turn: acting };
    s.rules = deriveRules(s);
    events.push({ type: "toast", text: "fx.doubleAgain" });
    return { ok: true, state: s, events };
  }
  s.players[acting].doubleMove = null;

  // Terrain the piece just walked into gets its own counter window.
  const trap = terrainAt(s, chosen.to, acting);
  if (trap) {
    const terrain: Action = { type: "terrain", sq: chosen.to, victim: acting, card: trap };
    const triggers = counterTriggers(s, acting, terrain);
    if (triggers.length > 0) {
      s.pending = { kind: "counter", color: acting, trigger: "terrain", action: terrain, chain: 0 };
      return { ok: true, state: s, events };
    }
    applyTerrain(s, chosen.to, acting, trap, events, rng);
  }

  endTurn(s, acting, events, rng);
  return { ok: true, state: s, events };
}

/**
 * Which square the piece a move is about to take is actually standing on.
 *
 * Normally the destination — but an en-passant capture takes a pawn that is
 * *beside* the destination, and every counter card that asks "what am I about
 * to lose" read the destination square instead. 작은 방패 and 회피 both looked
 * there, found nothing, and let the capture through with the cost already paid
 * and the card already in the discard pile.
 */
function victimSquare(s: MatchState, from: Square, to: Square): Square | null {
  const move = generateLegalMoves(s.chess, from, s.rules).find((m) => m.to === to);
  if (!move?.captured) return null;
  return move.flags.includes("en-passant")
    ? makeSquare(fileOf(to, s.chess), rankOf(from, s.chess), s.chess)
    : to;
}

/** The trap or terrain waiting on `sq` for a piece of `victim`, if any. */
function terrainAt(s: MatchState, sq: Square, victim: Color): string | null {
  for (const color of ["w", "b"] as Color[]) {
    for (const l of s.players[color].lasting) {
      if (l.card === "swamp" && l.sq === sq) return "swamp";
    }
  }
  const mine = s.enchants.find((e) => e.card === "mine" && e.on.kind !== "player" && e.on.sq === sq);
  if (mine && mine.owner !== victim) return "mine";
  return null;
}

/**
 * Hold the piece on `sq` still through `victim`'s next turn — a swamp it walked
 * into, a move that was taken back out from under it.
 *
 * This is an enchant rather than an entry in `players[victim].locked` because a
 * turn-long hold has to survive the start of that turn, and `beginTurn` empties
 * `locked` before it derives the rules from it. Both 늪지 and 무르기 promised a
 * turn of immobility and delivered none: the lock existed only for the rest of
 * the turn in which the piece had already moved.
 *
 * Two ticks, not one, for the same reason. The clock counts down as the
 * victim's turn opens, so a hold of 1 would expire on the very turn it is meant
 * to cover; at 2 it is still standing through that turn and gone by the next.
 * Riding on the enchant list also means it follows the piece, dies with it, and
 * shows up on the board as a badge — all of which `locked` never did.
 */
function holdPiece(s: MatchState, sq: Square, victim: Color, card: string): void {
  if (!s.chess.board[sq]) return;
  addEnchant(s, {
    card, owner: opposite(victim), on: { kind: "piece", sq },
    turnsLeft: 2, ticksOn: victim, data: { hold: 1 },
  });
}

function applyTerrain(
  s: MatchState,
  sq: Square,
  victim: Color,
  card: string,
  events: MatchEvent[],
  rng: Rng,
): void {
  if (card === "swamp") {
    holdPiece(s, sq, victim, "swamp");
    events.push({ type: "toast", text: "fx.swamp" });
    return;
  }
  if (card === "mine") {
    s.enchants = s.enchants.filter((e) => !(e.card === "mine" && e.on.kind !== "player" && e.on.sq === sq));
    const piece = s.chess.board[sq];
    if (piece?.type === "k") {
      // A king does not die on a mine; the move is simply refused.
      if (s.undo) {
        s.chess = cloneState(s.undo.chess);
        events.push({ type: "toast", text: "fx.mineKingBack" });
      }
    } else {
      destroyPiece(s, sq, events, rng);
      events.push({ type: "toast", text: "fx.mine" });
    }
  }
}

// ── playing a card ──────────────────────────────────────────
function playSkill(
  s: MatchState,
  acting: Color,
  index: number,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  if (!cardsAllowed(s)) return fail("this mode plays no cards");
  if (!inCardPhase(s)) return fail("not the card step");

  const p = s.players[acting];
  const id = p.hand[index];
  if (!id || isPieceCard(id)) return fail("not a skill card");
  const meta = skillMeta(id);
  if (!meta) return fail("unknown card");
  if (meta.speed === "counter") return fail("counter cards are played on the opponent's turn");
  // 속공 is exempt from the one-card-a-turn limit — docs/skill.md defines it as
  // "코스트만 있으면 다른 카드와 함께 사용 가능", and cost is the only thing that
  // holds it back. Counting quick cards against the limit was what made 준비
  // 태세 unplayable in practice: it granted +2 cost for the turn and then the
  // limit forbade the card you were meant to spend it on. Every 1-cost cantrip
  // had the same problem — spending your one card of the turn to draw two.
  if (meta.speed !== "quick" && s.skillsPlayed >= 1) return fail("one skill card a turn");
  const price = cardCost(id, s, acting);
  if (purse(p) < price) return fail("not enough cost");

  pay(p, price);
  p.hand.splice(index, 1);
  // Playing from hand renumbers it, and 정찰's notes are hand indices.
  forgetRevealed(s, acting, index);
  if (meta.speed !== "quick") s.skillsPlayed += 1;

  // Everything below runs on the clone, so a refusal here costs nothing: the
  // card is back in hand and the cost unspent the moment `fail` is returned.
  const targets = meta.targets ?? [];
  if (targets.length > 0 && !stepIsAnswerable(s, acting, targets[0])) {
    return fail("nothing this card can be aimed at");
  }

  events.push({ type: "played", color: acting, card: id });

  if (targets.length > 0) {
    s.pending = { kind: "targeting", color: acting, card: id, step: 0, picks: [] };
    return { ok: true, state: s, events };
  }
  return resolveCard(s, acting, id, [], events, rng);
}

/** Where a played card ends up once it has resolved. */
function fileCard(s: MatchState, color: Color, meta: SkillMeta): void {
  if (meta.type === "lasting") {
    s.players[color].lasting.push({ id: s.nextEffectId++, card: meta.id, owner: color });
  } else {
    s.players[color].discard.push(meta.id);
  }
  // 일반·부여·지속 are all played instead of moving; only 속공 keeps the move.
  if (meta.speed === "normal") s.moveSpent = true;
}

// ── targeting ───────────────────────────────────────────────
/**
 * 성역: the card says the pieces round your king "cannot be targeted by their
 * cards", and `rules.protected` only ever taught the move generator not to
 * capture there. A card aimed at one still landed, which is most of what the
 * card was bought for — so every targeting step asks here too.
 */
export function isShielded(s: MatchState, sq: Square, from: Color): boolean {
  const piece = s.chess.board[sq];
  if (!piece || piece.color === from) return false; // your own sanctuary never blocks you
  return (s.rules.protected ?? []).includes(sq);
}

/** Is `pick` a legal answer to `spec` for `color` right now? */
function pickIsLegal(s: MatchState, color: Color, spec: TargetSpec, pick: Pick): boolean {
  const board = s.chess.board;
  if (pick.kind === "square") {
    const piece = board[pick.sq];
    if (spec.kinds.includes("empty") && !piece) return true;
    if (!piece) return false;
    if (piece.type === "k" && !spec.king) return false;
    if (spec.pieces && !spec.pieces.includes(piece.type)) return false;
    if (isShielded(s, pick.sq, color)) return false;
    if (spec.kinds.includes("own-piece") && piece.color === color) return true;
    if (spec.kinds.includes("enemy-piece") && piece.color !== color) return true;
    return false;
  }
  if (pick.kind === "lasting") {
    if (!spec.kinds.includes("lasting")) return false;
    return [s.players.w, s.players.b].some((p) => p.lasting.some((l) => l.id === pick.id));
  }
  if (pick.kind === "index") {
    if (spec.kinds.includes("own-hand")) return pick.index < s.players[color].hand.length;
    if (spec.kinds.includes("opp-hand")) return pick.index < s.players[opposite(color)].hand.length;
    if (spec.kinds.includes("discard")) return pick.index < s.players[color].discard.length;
    return false;
  }
  return spec.kinds.includes("choice") && (spec.options ?? []).includes(pick.option);
}

/**
 * How many answers `spec` has on the board right now.
 *
 * This is what stops a card being paid for and then getting stuck: 헌납 asks for
 * a card in your hand, and played as your *last* card there is nothing left to
 * point at — the cost is gone, the card is gone, and the only way out is to
 * cancel. Counting the answers before the card is committed turns that into a
 * card that simply cannot be played yet, which is what it always was.
 */
function pickCount(s: MatchState, color: Color, spec: TargetSpec): number {
  let n = 0;
  for (const kind of spec.kinds) {
    if (kind === "own-hand") n += s.players[color].hand.length;
    else if (kind === "opp-hand") n += s.players[opposite(color)].hand.length;
    else if (kind === "discard") n += s.players[color].discard.length;
    else if (kind === "lasting") n += s.players.w.lasting.length + s.players.b.lasting.length;
    else if (kind === "choice") n += (spec.options ?? []).length;
    else {
      // A square kind: count the squares that would survive `pickIsLegal`.
      for (let sq = 0; sq < s.chess.board.length; sq++) {
        if (pickIsLegal(s, color, { kinds: [kind], min: spec.min, max: spec.max, pieces: spec.pieces, king: spec.king }, { kind: "square", sq })) {
          n++;
        }
      }
    }
  }
  return n;
}

/** The step is answerable: it wants nothing, or there is something to give it. */
function stepIsAnswerable(s: MatchState, color: Color, spec: TargetSpec | undefined): boolean {
  return !spec || spec.min === 0 || pickCount(s, color, spec) >= spec.min;
}

function reduceTargeting(
  s: MatchState,
  p: Extract<Pending, { kind: "targeting" }>,
  action: Action,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const meta = skillMeta(p.card);
  if (!meta) return fail("unknown card");
  const specs = meta.targets ?? [];
  const spec = specs[p.step];
  if (!spec) return fail("nothing left to target");

  if (action.type === "target-cancel") {
    // Give the card and its cost back: nothing has happened yet.
    const player = s.players[p.color];
    player.hand.push(p.card);
    player.cost = Math.min(modeRules(s.mode).costCap, player.cost + cardCost(p.card, s, p.color));
    // Only what the limit counted comes back off it; a quick card never went on.
    if (meta.speed !== "quick") s.skillsPlayed = Math.max(0, s.skillsPlayed - 1);
    s.pending = null;
    return { ok: true, state: s, events };
  }

  const current = p.picks[p.step] ?? [];

  if (action.type === "target-done") {
    if (current.length < spec.min) return fail("not enough targets");
    return advanceTargeting(s, p, events, rng);
  }

  if (action.type !== "target") return fail("expected a target");
  const pick: Pick | null =
    action.sq !== undefined ? { kind: "square", sq: action.sq }
    : action.lasting !== undefined ? { kind: "lasting", id: action.lasting }
    : action.index !== undefined ? { kind: "index", index: action.index }
    : action.option !== undefined ? { kind: "option", option: action.option }
    : null;
  if (!pick) return fail("empty target");
  if (!pickIsLegal(s, p.color, spec, pick)) return fail("illegal target");
  if (current.length >= spec.max) return fail("that step is full");
  // No answer twice in the same step. Squares were guarded from the start;
  // indices were not, so 위장 and 강요 would happily take the same card in hand
  // as both of their picks — and then remove two cards for it, the second of
  // them one the player never pointed at.
  const duplicate =
    pick.kind === "square" ? current.some((c) => c.kind === "square" && c.sq === pick.sq)
    : pick.kind === "index" ? current.some((c) => c.kind === "index" && c.index === pick.index)
    : pick.kind === "lasting" ? current.some((c) => c.kind === "lasting" && c.id === pick.id)
    : current.some((c) => c.kind === "option" && c.option === pick.option);
  if (duplicate) return fail("already picked");

  const picks = p.picks.slice();
  picks[p.step] = [...current, pick];
  s.pending = { ...p, picks };
  const filled = picks[p.step]!.length;
  // A step that wants exactly one answer never needs a confirmation click.
  if (filled >= spec.max) {
    return advanceTargeting(s, s.pending as Extract<Pending, { kind: "targeting" }>, events, rng);
  }
  return { ok: true, state: s, events };
}

function advanceTargeting(
  s: MatchState,
  p: Extract<Pending, { kind: "targeting" }>,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const meta = skillMeta(p.card)!;
  const specs = meta.targets ?? [];
  const step = p.step + 1;
  const picks = p.picks.slice();
  if (!picks[p.step]) picks[p.step] = [];
  if (step < specs.length) {
    // The next step's answers depend on this step's pick, so feasibility can
    // only be judged here. An unanswerable next step means the pick that led to
    // it was the wrong one — refuse it and let them choose again.
    if (!stepIsAnswerable(s, p.color, specs[step])) return fail("that leaves the card nothing to aim at");
    s.pending = { ...p, step, picks };
    return { ok: true, state: s, events };
  }
  s.pending = null;
  return resolveCard(s, p.color, p.card, picks, events, rng);
}

// ── card effects ────────────────────────────────────────────
interface Ctx {
  s: MatchState;
  me: Color;
  opp: Color;
  picks: Pick[][];
  events: MatchEvent[];
  rng: Rng;
}

const sqAt = (c: Ctx, step: number, i = 0): Square | null => {
  const pick = c.picks[step]?.[i];
  return pick && pick.kind === "square" ? pick.sq : null;
};
const idxAt = (c: Ctx, step: number, i = 0): number | null => {
  const pick = c.picks[step]?.[i];
  return pick && pick.kind === "index" ? pick.index : null;
};
const lastingAt = (c: Ctx, step: number, i = 0): number | null => {
  const pick = c.picks[step]?.[i];
  return pick && pick.kind === "lasting" ? pick.id : null;
};
const optAt = (c: Ctx, step: number): string | null => {
  const pick = c.picks[step]?.[0];
  return pick && pick.kind === "option" ? pick.option : null;
};

/**
 * One entry per card. A handler returns an error string to refuse the card —
 * refusals are only reachable for target combinations the generic validation
 * cannot see (a shove with nothing behind it), and the caller has already
 * cloned the state, so a refusal throws the whole attempt away cleanly.
 */
const EFFECTS: Record<string, (c: Ctx) => string | void> = {
  // ── information ────────────────────────────────────────────
  scout: (c) => {
    const i = idxAt(c, 0);
    if (i === null) return "no card picked";
    if (!c.s.players[c.me].revealed.includes(i)) c.s.players[c.me].revealed.push(i);
  },
  spy: (c) => {
    const lib = c.s.players[c.opp].library;
    c.s.players[c.me].seenTop = lib[lib.length - 1] ?? null;
  },
  clairvoyance: (c) => {
    c.s.players[c.me].revealed = c.s.players[c.opp].hand.map((_, i) => i);
  },
  divination: (c) => {
    const lib = c.s.players[c.me].library;
    const top = lib.splice(Math.max(0, lib.length - 3)).reverse();
    if (top.length === 0) return;
    c.s.pending = { kind: "arrange", color: c.me, cards: top };
  },

  // ── card flow ──────────────────────────────────────────────
  meditate: (c) => { drawFor(c.s, c.me, 2, c.events, c.rng); },
  offering: (c) => {
    const i = idxAt(c, 0);
    const p = c.s.players[c.me];
    if (i === null || !p.hand[i]) return "no card to give";
    p.discard.push(p.hand.splice(i, 1)[0]!);
    forgetRevealed(c.s, c.me, i);
    drawFor(c.s, c.me, 2, c.events, c.rng);
  },
  disguise: (c) => {
    const p = c.s.players[c.me];
    // Highest index first: taking cards out of a list renumbers everything
    // after them, so removing in ascending order removes the wrong ones. This
    // used to look each card up by *id* instead — and a card picked twice found
    // itself once and then missed, and `splice(-1, 1)` threw away whatever
    // happened to be last in hand.
    const idx = (c.picks[0] ?? [])
      .filter((x): x is Extract<Pick, { kind: "index" }> => x.kind === "index")
      .map((x) => x.index)
      .sort((a, b) => b - a);
    const ids: string[] = [];
    for (const i of idx) {
      const card = p.hand[i];
      if (!card) continue;
      p.hand.splice(i, 1);
      forgetRevealed(c.s, c.me, i);
      ids.push(card);
    }
    p.library.push(...ids);
    p.library = shuffle(p.library, c.rng);
    drawFor(c.s, c.me, ids.length, c.events, c.rng);
  },
  herald: (c) => {
    const i = idxAt(c, 0);
    const p = c.s.players[c.me];
    if (i === null || !p.discard[i]) return "no such card";
    p.library.push(p.discard.splice(i, 1)[0]!);
    p.library = shuffle(p.library, c.rng);
  },
  recall: (c) => {
    const i = idxAt(c, 0);
    const p = c.s.players[c.me];
    if (i === null || !p.discard[i]) return "no such card";
    if (p.hand.length >= modeRules(c.s.mode).handCap) return "your hand is full";
    p.hand.push(p.discard.splice(i, 1)[0]!);
  },
  coerce: (c) => {
    const them = c.s.players[c.opp];
    const idx = (c.picks[0] ?? [])
      .filter((x): x is Extract<Pick, { kind: "index" }> => x.kind === "index")
      .map((x) => x.index)
      .sort((a, b) => b - a);
    for (const i of idx) {
      const card = them.hand.splice(i, 1)[0];
      if (card) them.library.push(card);
      forgetRevealed(c.s, c.opp, i);
    }
    them.library = shuffle(them.library, c.rng);
  },
  exchange: (c) => {
    const mine = idxAt(c, 0);
    const theirs = idxAt(c, 1);
    const me = c.s.players[c.me];
    const them = c.s.players[c.opp];
    if (mine === null || theirs === null || !me.hand[mine] || !them.hand[theirs]) return "nothing to swap";
    const a = me.hand[mine]!;
    me.hand[mine] = them.hand[theirs]!;
    them.hand[theirs] = a;
    c.s.players[c.me].revealed = [];
  },
  readiness: (c) => { grantCost(c.s, c.me, 2); },

  // ── enchants that simply attach ────────────────────────────
  bait: (c) => attach(c, "bait", 0, null),
  "small-sandbag": (c) => attach(c, "small-sandbag", 0, 2),
  "large-sandbag": (c) => attach(c, "large-sandbag", 0, 5),
  leap: (c) => attach(c, "leap", 0, 3),
  "guard-drill": (c) => attach(c, "guard-drill", 0, null),
  disarm: (c) => attach(c, "disarm", 0, 5, c.opp),
  mine: (c) => {
    const sq = sqAt(c, 0);
    if (sq === null) return "no square";
    addEnchant(c.s, {
      card: "mine", owner: c.me, on: { kind: "square", sq },
      turnsLeft: null, ticksOn: c.me, data: { hidden: 1 },
    });
  },

  // ── enchants with a payload ────────────────────────────────
  brainwash: (c) => {
    const picks = (c.picks[0] ?? []).filter((x): x is Extract<Pick, { kind: "square" }> => x.kind === "square");
    if (picks.length === 0) return "no pawns picked";
    for (const { sq } of picks) {
      const piece = c.s.chess.board[sq];
      if (!piece || piece.type !== "p" || piece.color === c.me) return "not an enemy pawn";
      c.s.chess.board[sq] = { color: c.me, type: "p" };
      addEnchant(c.s, {
        card: "brainwash", owner: c.me, on: { kind: "piece", sq },
        turnsLeft: null, ticksOn: c.me, data: { from: piece.color },
      });
    }
  },
  "bond-chain": (c) => chain(c, "bond-chain"),
  "fate-chain": (c) => chain(c, "fate-chain"),
  awaken: (c) => {
    const sq = sqAt(c, 0);
    const piece = sq === null ? null : c.s.chess.board[sq];
    if (!sq || !piece || piece.type === "k" || piece.type === "q") return "pick a piece to crown";
    c.s.chess.board[sq] = { color: c.me, type: "q" };
    addEnchant(c.s, {
      card: "awaken", owner: c.me, on: { kind: "piece", sq },
      turnsLeft: 5, ticksOn: c.me, data: { was: piece.type },
    });
  },
  "double-image": (c) => {
    const from = sqAt(c, 0);
    const to = sqAt(c, 1);
    const piece = from === null ? null : c.s.chess.board[from];
    if (from === null || to === null || !piece) return "pick a piece and an empty square";
    if (piece.type === "k") return "the king has no double";
    if (!neighborsOf(c.s, from).includes(to)) return "the double appears beside its original";
    if (c.s.chess.board[to]) return "that square is taken";
    c.s.chess.board[to] = { ...piece };
    addEnchant(c.s, {
      card: "double-image", owner: c.me, on: { kind: "piece", sq: to },
      turnsLeft: 5, ticksOn: c.me,
    });
  },

  // ── dispels ────────────────────────────────────────────────
  cleanse: (c) => dispel(c, true),
  unbind: (c) => dispel(c, false),
  "purifying-light": (c) => {
    const board = c.s.chess.board;
    for (const e of [...c.s.enchants]) {
      if (e.on.kind === "player") continue;
      if (board[e.on.sq]?.color !== c.me) continue;
      endEnchant(c.s, e, c.events);
    }
  },
  typhoon: (c) => {
    for (const color of ["w", "b"] as Color[]) {
      const p = c.s.players[color];
      for (const l of p.lasting) {
        p.discard.push(l.card);
        c.events.push({ type: "destroyed", color, card: l.card });
      }
      p.lasting = [];
    }
  },
  shatter: (c) => {
    // A lasting card and a card in hand arrive as different kinds of pick, so
    // there is nothing left to guess about which one was meant.
    const lastingId = lastingAt(c, 0);
    if (lastingId !== null) {
      for (const color of ["w", "b"] as Color[]) {
        const p = c.s.players[color];
        const at = p.lasting.findIndex((l) => l.id === lastingId);
        if (at < 0) continue;
        const [gone] = p.lasting.splice(at, 1);
        p.discard.push(gone!.card);
        c.events.push({ type: "destroyed", color, card: gone!.card });
        return;
      }
      return "that card is not in play";
    }
    const i = idxAt(c, 0);
    if (i === null) return "nothing picked";
    const them = c.s.players[c.opp];
    const card = them.hand[i];
    if (!card) return "nothing to shatter";
    them.hand.splice(i, 1);
    forgetRevealed(c.s, c.opp, i);
    them.discard.push(card);
    c.events.push({ type: "destroyed", color: c.opp, card });
  },

  // ── board effects ──────────────────────────────────────────
  dash: (c) => {
    const from = sqAt(c, 0);
    const to = sqAt(c, 1);
    if (from === null || to === null) return "pick a piece and a square";
    if (!neighborsOf(c.s, from).includes(to)) return "one square only";
    if (c.s.chess.board[to]) return "Dash cannot capture";
    return slide(c, from, to);
  },
  shove: (c) => {
    const mine = sqAt(c, 0);
    const theirs = sqAt(c, 1);
    if (mine === null || theirs === null) return "pick your piece and theirs";
    if (!neighborsOf(c.s, mine).includes(theirs)) return "they must be adjacent";
    const step = lineStep(c.s, mine, theirs);
    if (!step) return "not in line";
    const dest = offset(c.s, theirs, step[0], step[1]);
    if (dest === null || c.s.chess.board[dest]) return "nowhere to shove them";
    return slide(c, theirs, dest);
  },
  pull: (c) => {
    const mine = sqAt(c, 0);
    const theirs = sqAt(c, 1);
    if (mine === null || theirs === null) return "pick your piece and theirs";
    const step = lineStep(c.s, mine, theirs);
    if (!step) return "not on a line";
    const dest = offset(c.s, mine, step[0], step[1]);
    if (dest === null || c.s.chess.board[dest]) return "no room in front of your piece";
    // The path between has to be clear, or nothing is being dragged anywhere.
    let cur = dest;
    while (cur !== theirs) {
      const next = offset(c.s, cur, step[0], step[1]);
      if (next === null) return "not on a line";
      if (next !== theirs && c.s.chess.board[next]) return "the path is blocked";
      cur = next;
    }
    return slide(c, theirs, dest);
  },
  transpose: (c) => {
    const a = sqAt(c, 0);
    const b = sqAt(c, 1);
    if (a === null || b === null || a === b) return "pick two different pieces";
    const pa = c.s.chess.board[a];
    const pb = c.s.chess.board[b];
    if (!pa || !pb || pa.color !== c.me || pb.color !== c.me) return "both must be yours";
    if (pa.type === "k" || pb.type === "k") return "not the king";
    c.s.chess.board[a] = pb;
    c.s.chess.board[b] = pa;
    followSquare(c.s, a, b);
    followSquare(c.s, b, a);
    if (isInCheck({ ...c.s.chess, turn: c.me }, c.me, c.s.rules)) return "that would expose your king";
  },
  promotion: (c) => {
    const sq = sqAt(c, 0);
    const into = optAt(c, 1) as PieceType | null;
    if (sq === null || !into) return "pick a pawn and a piece";
    const piece = c.s.chess.board[sq];
    if (!piece || piece.color !== c.me || piece.type !== "p") return "not your pawn";
    c.s.chess.board[sq] = { color: c.me, type: into };
  },
  javelin: (c) => {
    const pawnSq = sqAt(c, 0);
    const targetSq = sqAt(c, 1);
    if (pawnSq === null || targetSq === null) return "pick a pawn and a target";
    const king = findKing(c.s.chess.board, c.me);
    if (king < 0 || !neighborsOf(c.s, king).includes(pawnSq)) return "the pawn must stand beside your king";
    const step = lineStep(c.s, pawnSq, targetSq);
    if (!step) return "throw along a line";
    // The javelin hits the first thing in that direction, and that has to be
    // the piece being aimed at.
    let cur = offset(c.s, pawnSq, step[0], step[1]);
    while (cur !== null && !c.s.chess.board[cur]) cur = offset(c.s, cur, step[0], step[1]);
    if (cur === null || cur !== targetSq) return "something else is in the way";
    const victim = c.s.chess.board[targetSq];
    if (!victim || victim.color === c.me) return "aim at an enemy";
    if (isShielded(c.s, targetSq, c.me)) return "that piece is under sanctuary";
    destroyPiece(c.s, targetSq, c.events, c.rng);
    destroyPiece(c.s, pawnSq, c.events, c.rng);
  },
  citadel: (c) => {
    const side = optAt(c, 0) ?? "king-side";
    const { chess } = c.s;
    const home = c.me === "w" ? 0 : chess.height - 1;
    const king = findKing(chess.board, c.me);
    if (king < 0 || rankOf(king, chess) !== home) return "the king has left home";
    const rookFile = side === "king-side" ? chess.width - 1 : 0;
    const rookSq = makeSquare(rookFile, home, chess);
    const rook = chess.board[rookSq];
    if (!rook || rook.color !== c.me || rook.type !== "r") return "no rook on that side";
    const dir = side === "king-side" ? 1 : -1;
    const kf = fileOf(king, chess);
    const kingTo = makeSquare(kf + 2 * dir, home, chess);
    const rookTo = makeSquare(kf + dir, home, chess);
    if (chess.board[kingTo] || chess.board[rookTo]) return "the path is not clear";
    chess.board[king] = null;
    chess.board[rookSq] = null;
    chess.board[kingTo] = { color: c.me, type: "k" };
    chess.board[rookTo] = { color: c.me, type: "r" };
    followSquare(c.s, king, kingTo);
    followSquare(c.s, rookSq, rookTo);
  },
  "kings-strike": (c) => {
    const sq = sqAt(c, 0);
    if (sq === null) return "pick a target";
    const king = findKing(c.s.chess.board, c.me);
    if (king < 0) return "no king";
    const ring = neighborsOf(c.s, king);
    if (!ring.includes(sq)) return "only beside your king";
    const victim = c.s.chess.board[sq];
    if (!victim || victim.color === c.me || victim.type === "k") return "aim at an enemy piece";
    if (isShielded(c.s, sq, c.me)) return "that piece is under sanctuary";
    destroyPiece(c.s, sq, c.events, c.rng);
    c.s.chess.board[king] = null;
    c.s.chess.board[sq] = { color: c.me, type: "k" };
    followSquare(c.s, king, sq);
  },
  assassinate: (c) => {
    const sq = sqAt(c, 0);
    const victim = sq === null ? null : c.s.chess.board[sq];
    if (sq === null || !victim || victim.color === c.me) return "pick an enemy piece";
    if (victim.type === "k" || victim.type === "q") return "not the king or queen";
    destroyPiece(c.s, sq, c.events, c.rng);
  },
  regicide: (c) => {
    const sq = sqAt(c, 0);
    const victim = sq === null ? null : c.s.chess.board[sq];
    if (sq === null || !victim || victim.color === c.me || victim.type !== "q") return "pick an enemy queen";
    destroyPiece(c.s, sq, c.events, c.rng);
  },
  earthquake: (c) => {
    for (let sq = c.s.chess.board.length - 1; sq >= 0; sq--) {
      if (c.s.chess.board[sq]?.type === "p") destroyPiece(c.s, sq, c.events, c.rng);
    }
  },
  pandemonium: (c) => {
    const { chess } = c.s;
    for (const color of ["w", "b"] as Color[]) {
      const pieces: Piece[] = [];
      for (let sq = 0; sq < chess.board.length; sq++) {
        const p = chess.board[sq];
        if (p && p.color === color && p.type !== "k") {
          pieces.push(p);
          chess.board[sq] = null;
        }
      }
      // Everyone regroups inside their own first two ranks.
      const home: Square[] = [];
      for (let rank = 0; rank < 2; rank++) {
        const r = color === "w" ? rank : chess.height - 1 - rank;
        for (let f = 0; f < chess.width; f++) {
          const sq = makeSquare(f, r, chess);
          if (!chess.board[sq]) home.push(sq);
        }
      }
      const spots = shuffle(home, c.rng);
      // The home ranks can be short: the king holds a square, and enemy pieces
      // may be squatting there too. Anyone who does not fit spills onto the
      // nearest free square rather than being dropped — the old code wrote past
      // the end of the list and the pieces it could not place simply ceased to
      // exist, with no `slain` event and nothing on screen to say so.
      const spill = (): Square | undefined => {
        for (let sq = 0; sq < chess.board.length; sq++) if (!chess.board[sq]) return sq;
        return undefined;
      };
      pieces.forEach((piece, i) => {
        const sq = spots[i] ?? spill();
        if (sq !== undefined) chess.board[sq] = piece;
      });
    }
    // Every square moved, so nothing that was pinned to one survives.
    c.s.enchants = c.s.enchants.filter((e) => e.on.kind === "player");
  },
  "blood-price": (c) => {
    const sq = sqAt(c, 0);
    const piece = sq === null ? null : c.s.chess.board[sq];
    if (sq === null || !piece || piece.color !== c.me) return "pick one of your own";
    if (piece.type === "k" || piece.type === "p") return "not the king or a pawn";
    destroyPiece(c.s, sq, c.events, c.rng);
    c.s.pending = { kind: "free-moves", color: c.me, movesLeft: 3, moved: [] };
  },
  double: (c) => {
    const sq = sqAt(c, 0);
    const piece = sq === null ? null : c.s.chess.board[sq];
    if (sq === null || !piece || piece.color !== c.me) return "pick one of your own";
    c.s.players[c.me].doubleMove = { sq, movesLeft: 2 };
  },
  rewind: (c) => {
    const undo = c.s.undo;
    if (!undo || undo.mover !== c.opp) return "there is nothing to take back";
    c.s.chess = cloneState(undo.chess);
    c.s.chess.turn = c.me;
    // Restoring the board threw away every enchant's idea of where things are,
    // so the hold goes on after the restore, aimed at the square the piece has
    // just been put back on.
    c.s.enchants = c.s.enchants.filter((e) => e.on.kind === "player" || !!c.s.chess.board[e.on.sq]);
    // They may not simply play the same move again next turn.
    holdPiece(c.s, undo.from, c.opp, "rewind");
    c.s.undo = null;
  },

  // ── lasting cards that only install themselves ─────────────
  swamp: (c) => {
    const sq = sqAt(c, 0);
    if (sq === null) return "pick an empty square";
    c.s.players[c.me].lasting.push({ id: c.s.nextEffectId++, card: "swamp", owner: c.me, sq });
  },
  hallucination: (c) => {
    c.s.players[c.me].lasting.push({
      id: c.s.nextEffectId++, card: "hallucination", owner: c.me, turnsLeft: 5,
    });
  },
  beacon: () => {},
  espionage: () => {},
  thrift: () => {},
  "muddy-water": () => {},
  "agile-knight": () => {},
  sanctuary: () => {},
  plague: () => {},
  "gambling-den": () => {},
};

/** 늪지/환각 push their own record, so the generic filing must not double up. */
const SELF_FILED = new Set(["swamp", "hallucination"]);

function offset(s: MatchState, sq: Square, df: number, dr: number): Square | null {
  const { chess } = s;
  const f = fileOf(sq, chess) + df;
  const r = rankOf(sq, chess) + dr;
  return onBoard(f, r, chess) ? makeSquare(f, r, chess) : null;
}

/** Move a piece without it being a chess move (shove, pull, dash). */
function slide(c: Ctx, from: Square, to: Square): string | void {
  const piece = c.s.chess.board[from];
  if (!piece) return "nothing there";
  if (c.s.chess.board[to]) return "that square is taken";
  c.s.chess.board[to] = piece;
  c.s.chess.board[from] = null;
  followSquare(c.s, from, to);
  if (isInCheck({ ...c.s.chess, turn: c.me }, c.me, c.s.rules)) return "that would expose your king";
}

function attach(c: Ctx, card: string, step: number, turns: number | null, ticksOn?: Color): string | void {
  const sq = sqAt(c, step);
  if (sq === null || !c.s.chess.board[sq]) return "pick a piece";
  addEnchant(c.s, {
    card, owner: c.me, on: { kind: "piece", sq },
    turnsLeft: turns, ticksOn: ticksOn ?? c.me,
  });
}

function chain(c: Ctx, card: string): string | void {
  const a = sqAt(c, 0);
  const b = sqAt(c, 1);
  if (a === null || b === null) return "pick one of yours and one of theirs";
  addEnchant(c.s, {
    card, owner: c.me, on: { kind: "piece", sq: a },
    turnsLeft: null, ticksOn: c.me, data: { partner: b },
  });
  addEnchant(c.s, {
    card, owner: c.me, on: { kind: "piece", sq: b },
    turnsLeft: null, ticksOn: c.me, data: { partner: a },
  });
}

function dispel(c: Ctx, own: boolean): string | void {
  const sq = sqAt(c, 0);
  if (sq === null) return "pick a piece";
  const piece = c.s.chess.board[sq];
  if (!piece) return "nothing there";
  if (own !== (piece.color === c.me)) return own ? "that is not yours" : "that is yours";
  const attached = enchantsOn(c.s, sq);
  if (attached.length === 0) return "nothing to lift";
  for (const e of attached) endEnchant(c.s, e, c.events);
}

/** Run a card's effect and file the card away. */
function resolveCard(
  s: MatchState,
  color: Color,
  id: string,
  picks: Pick[][],
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const meta = skillMeta(id)!;
  const handler = EFFECTS[id];
  if (handler) {
    const err = handler({ s, me: color, opp: opposite(color), picks, events, rng });
    if (err) return fail(err);
  }
  if (!(meta.type === "lasting" && SELF_FILED.has(id))) fileCard(s, color, meta);
  else if (meta.speed === "normal") s.moveSpent = true;

  s.rules = deriveRules(s);
  resolveEnding(s, events);
  return { ok: true, state: s, events };
}

// ── pending (multi-step) dispatch ───────────────────────────
function reducePending(
  s: MatchState,
  action: Action,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const p = s.pending as Pending;
  const color = p.color;

  if (p.kind === "draw-choice") {
    if (action.type === "draw-skip") {
      s.pending = null;
      s.phase = nextPhase(s, "draw");
      events.push({ type: "toast", text: "fx.drawDeclined" });
      return { ok: true, state: s, events };
    }
    if (action.type === "draw-take") {
      const player = s.players[color];
      const card = drawCard(player, rng);
      if (!card) {
        s.pending = null;
        s.phase = nextPhase(s, "draw");
        return { ok: true, state: s, events };
      }
      player.hand.push(card);
      events.push({ type: "drew", color, card });
      onOpponentDrew(s, color, events, rng);
      s.pending = { kind: "discard", color };
      return { ok: true, state: s, events };
    }
    return fail("expected draw-skip / draw-take");
  }

  if (p.kind === "discard") {
    if (action.type !== "discard") return fail("expected discard");
    const player = s.players[color];
    const card = player.hand[action.index];
    if (!card) return fail("no such card in hand");
    player.hand.splice(action.index, 1);
    forgetRevealed(s, color, action.index);
    player.discard.push(card);
    s.pending = null;
    s.phase = nextPhase(s, "draw");
    events.push({ type: "toast", text: "fx.discarded" });
    return { ok: true, state: s, events };
  }

  if (p.kind === "arrange") {
    if (action.type !== "arrange") return fail("expected arrange");
    const player = s.players[color];
    const order = action.order;
    if (order.length !== p.cards.length) return fail("that is not the same cards");
    const seen = new Set(order);
    if (seen.size !== order.length || order.some((i) => i < 0 || i >= p.cards.length)) {
      return fail("bad ordering");
    }
    // Last in the list ends up on top of the deck, which is where a draw takes from.
    for (const i of order) player.library.push(p.cards[i]!);
    s.pending = null;
    return { ok: true, state: s, events };
  }

  if (p.kind === "counter") return reduceCounter(s, p, action, events, rng);

  if (p.kind === "summon-place") {
    if (action.type !== "summon-place") return fail("expected summon-place");
    if (!summonZone(s, color).includes(action.sq)) return fail("outside your summoning zone");
    s.chess.board[action.sq] = { color, type: p.piece };
    s.players[color].summonSick.push(action.sq);
    s.players[color].discard.push(p.card);
    s.chess = { ...s.chess, halfmoveClock: 0 };
    s.pending = null;
    s.rules = deriveRules(s);
    events.push({ type: "played", color, card: p.card });
    events.push({ type: "toast", text: "fx.summoned" });
    resolveEnding(s, events);
    return { ok: true, state: s, events };
  }

  if (p.kind === "targeting") return reduceTargeting(s, p, action, events, rng);

  if (p.kind === "free-moves") {
    if (action.type === "free-move") {
      if (p.moved.includes(action.from)) return fail("that piece has already moved");
      const legal = generateLegalMoves(s.chess, action.from, s.rules).filter(
        (m) => m.to === action.to && !m.captured,
      );
      const mv = legal[0];
      if (!mv || s.chess.board[action.from]?.color !== color) return fail("illegal move");
      s.chess = { ...applyMove(s.chess, mv), turn: color };
      followSquare(s, action.from, action.to);
      const moved = [...p.moved, action.to];
      if (p.movesLeft - 1 <= 0) {
        s.pending = null;
        endTurn(s, color, events, rng);
      } else {
        s.pending = { kind: "free-moves", color, movesLeft: p.movesLeft - 1, moved };
      }
      return { ok: true, state: s, events };
    }
    if (action.type === "free-move-end") {
      s.pending = null;
      endTurn(s, color, events, rng);
      return { ok: true, state: s, events };
    }
    return fail("expected free-move / free-move-end");
  }

  return fail("unknown pending step");
}

// ── the counter chain ───────────────────────────────────────
/**
 * A counter window. Passing lets the stashed action through; answering with a
 * card can open a window of its own, and the chain unwinds last-played-first.
 */
function reduceCounter(
  s: MatchState,
  p: Extract<Pending, { kind: "counter" }>,
  action: Action,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  if (action.type === "counter-pass") {
    s.pending = null;
    return applyAction(s, p.action, events, rng);
  }
  if (action.type !== "counter-play") return fail("expected counter-play / counter-pass");

  const responder = s.players[p.color];
  const id = responder.hand[action.index];
  const meta = id ? skillMeta(id) : undefined;
  if (!id || !meta || meta.speed !== "counter" || meta.trigger !== p.trigger) {
    return fail("that card does not answer this action");
  }
  const price = cardCost(id, s, p.color);
  if (purse(responder) < price) return fail("not enough cost");
  pay(responder, price);
  responder.hand.splice(action.index, 1);
  forgetRevealed(s, p.color, action.index);
  responder.discard.push(id);
  s.pending = null;
  events.push({ type: "played", color: p.color, card: id });

  return resolveCounter(s, p, id, events, rng);
}

/**
 * What each counter card does to the action it was played against. Negating
 * something destroys the card that made it — 전령/회수 can fish it back out of
 * the discard pile, which is what "destroyed" means here.
 */
function resolveCounter(
  s: MatchState,
  p: Extract<Pending, { kind: "counter" }>,
  id: string,
  events: MatchEvent[],
  rng: Rng,
): ReduceResult {
  const responder = p.color;
  const blocked = p.action;
  // For terrain the "mover" is the player who walked into it — the same player
  // holding the window, since it is their own piece at risk.
  const mover = blocked.type === "terrain" ? blocked.victim : opposite(responder);

  const negate = (): ReduceResult => {
    if (blocked.type === "play-skill") {
      const card = s.players[mover].hand[blocked.index];
      if (card) {
        s.players[mover].hand.splice(blocked.index, 1);
        forgetRevealed(s, mover, blocked.index);
        s.players[mover].discard.push(card);
        events.push({ type: "destroyed", color: mover, card });
      }
    }
    s.rules = deriveRules(s);
    resolveEnding(s, events);
    return { ok: true, state: s, events };
  };

  switch (id) {
    case "vigilance":
      // Just a card off the top; the action carries on as it would have.
      drawFor(s, responder, 1, events, rng);
      return applyAction(s, blocked, events, rng);

    case "insight": {
      // Only a 속공 or another 대응 can be read this way.
      if (blocked.type !== "play-skill") return applyAction(s, blocked, events, rng);
      const card = s.players[mover].hand[blocked.index];
      const meta = card ? skillMeta(card) : undefined;
      if (!meta || (meta.speed !== "quick" && meta.speed !== "counter")) {
        return applyAction(s, blocked, events, rng);
      }
      events.push({ type: "toast", text: "fx.insight" });
      return negate();
    }

    case "riposte": {
      if (blocked.type !== "play-skill") return applyAction(s, blocked, events, rng);
      const card = s.players[mover].hand[blocked.index];
      const meta = card ? skillMeta(card) : undefined;
      if (!meta || meta.speed !== "quick") return applyAction(s, blocked, events, rng);
      negate();
      // Turned back on its owner: the responder plays it, for free, if it
      // needs no targets. A targeted steal would need a whole targeting turn
      // on the wrong side of the table, so those are only negated.
      if ((meta.targets ?? []).length === 0) {
        const res = resolveCard(s, responder, card!, [], events, rng);
        if (!res.ok) return { ok: true, state: s, events };
        return res;
      }
      return { ok: true, state: s, events };
    }

    case "small-shield": {
      // A pawn shrugs the attack off; the attacker stays where it was.
      if (blocked.type !== "move") return applyAction(s, blocked, events, rng);
      const victimSq = victimSquare(s, blocked.from, blocked.to);
      const victim = victimSq === null ? null : s.chess.board[victimSq];
      if (!victim || victim.color !== responder || victim.type !== "p") {
        return applyAction(s, blocked, events, rng);
      }
      events.push({ type: "toast", text: "fx.shield" });
      endTurn(s, mover, events, rng);
      return { ok: true, state: s, events };
    }

    case "evade": {
      if (blocked.type !== "move") return applyAction(s, blocked, events, rng);
      const victimSq = victimSquare(s, blocked.from, blocked.to);
      if (victimSq === null || s.chess.board[victimSq]?.color !== responder) {
        return applyAction(s, blocked, events, rng);
      }
      const escapes = neighborsOf(s, victimSq).filter((sq) => !s.chess.board[sq]);
      if (escapes.length === 0) return applyAction(s, blocked, events, rng);
      const to = escapes[Math.floor(rng() * escapes.length)]!;
      const victim = s.chess.board[victimSq]!;
      s.chess.board[to] = victim;
      s.chess.board[victimSq] = null;
      followSquare(s, victimSq, to);
      events.push({ type: "toast", text: "fx.evade" });
      // The attacker still takes the square it was aiming at.
      return applyAction(s, blocked, events, rng);
    }

    case "ward": {
      if (blocked.type !== "terrain") return applyAction(s, blocked, events, rng);
      if (blocked.card === "mine") {
        s.enchants = s.enchants.filter(
          (e) => !(e.card === "mine" && e.on.kind !== "player" && e.on.sq === blocked.sq),
        );
      }
      events.push({ type: "toast", text: "fx.ward" });
      endTurn(s, mover, events, rng);
      return { ok: true, state: s, events };
    }

    case "sever": {
      if (blocked.type !== "play-skill") return applyAction(s, blocked, events, rng);
      events.push({ type: "toast", text: "fx.sever" });
      return negate();
    }

    case "bodyguard": {
      // The guard dies in the king's place and the king takes its square — so
      // the guard has to be a piece the king could actually step onto. Picking
      // any piece on the board (which is what an unfiltered list gives you) sent
      // the king across the board to wherever the lowest-numbered square was.
      const king = findKing(s.chess.board, responder);
      if (king < 0) return applyAction(s, blocked, events, rng);
      const guards = neighborsOf(s, king).filter((sq) => {
        const pc = s.chess.board[sq];
        return !!pc && pc.color === responder && pc.type !== "k";
      });
      // The cheapest shield in reach: spending a rook to save a tempo is not a
      // trade anyone would choose, and the player is not asked.
      const pick = guards.sort((a, b) => GUARD_VALUE[s.chess.board[a]!.type] - GUARD_VALUE[s.chess.board[b]!.type])[0];
      if (pick === undefined) return applyAction(s, blocked, events, rng);
      destroyPiece(s, pick, events, rng);
      s.chess.board[king] = null;
      s.chess.board[pick] = { color: responder, type: "k" };
      followSquare(s, king, pick);
      events.push({ type: "toast", text: "fx.bodyguard" });
      s.rules = deriveRules(s);
      return { ok: true, state: s, events };
    }

    case "last-stand": {
      const king = findKing(s.chess.board, responder);
      const empty: Square[] = [];
      for (let sq = 0; sq < s.chess.board.length; sq++) if (!s.chess.board[sq]) empty.push(sq);
      if (king < 0 || empty.length === 0) return applyAction(s, blocked, events, rng);
      // Somewhere the mating net does not reach, if such a square exists.
      const safe = empty.find((sq) => {
        const trial = s.chess.board.slice();
        trial[king] = null;
        trial[sq] = { color: responder, type: "k" };
        return !isInCheck({ ...s.chess, board: trial, turn: responder }, responder, s.rules);
      }) ?? empty[Math.floor(rng() * empty.length)]!;
      s.chess.board[king] = null;
      s.chess.board[safe] = { color: responder, type: "k" };
      followSquare(s, king, safe);
      events.push({ type: "toast", text: "fx.lastStand" });
      s.rules = deriveRules(s);
      return { ok: true, state: s, events };
    }

    default:
      return applyAction(s, blocked, events, rng);
  }
}

/** Re-exported so clients can mirror the engine's own idea of a legal drop. */
export type { Piece };
export type { Enchant };
