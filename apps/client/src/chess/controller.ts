import {
  fileOf,
  generateLegalMoves,
  isInCheck,
  opposite,
  rankOf,
  type Color,
  type Piece,
  type PieceType,
  type Square,
} from "@skill/chess-core";
import {
  cardCost,
  isPieceCard,
  modeRules,
  needsTargets,
  skillMeta,
  summonZone,
  usesCards,
  type Action,
  type CounterTrigger,
  type GameMode,
  type MatchEvent,
  type MatchState,
  type TargetSpec,
} from "@skill/engine";
import { el, type AppContext, type Screen } from "../router.js";
import { animLength, BoardRenderer, preloadPieces, type BoardAnim, type RenderOptions } from "../render.js";
import { cardToken, icon, type IconName } from "../ui/art.js";
import { skillIcon } from "../skills.js";
import { createLocalSession, type Session } from "./session.js";
import { draftAiDeck } from "./ai-deck.js";
import type { SearchOptions } from "./ai.js";
import { menuScreen } from "../screens/menu.js";
import { deckForMatch } from "../decks.js";
import { cardBackEl, cardEl, fitNames } from "../ui/card.js";
import { createCutIn } from "../ui/cutin.js";
import { closeCardZoom, openCardZoom, openPileView, type ZoomAction } from "../ui/card-zoom.js";
import { getNickname } from "../player.js";
import { recordRanked, type RankChange } from "../rank.js";
import { rankBadge } from "../ui/rank-badge.js";
import {
  createClock, formatClock, getTimeControlId, isUntimed, timeControlById,
  type Clock, type TimeControl,
} from "../clock.js";
import { cardName, modeName, pieceName, t, tPassthrough } from "../i18n.js";
import { isMuted, playSfx, primeAudio, setMuted, type Sfx } from "../audio.js";

export interface ChessOptions {
  mode: GameMode;
  humanColor: Color;
  /** Search budget for the AI, taken from the chosen difficulty rung. */
  search: SearchOptions;
  /** Clock for the match. Defaults to the player's saved choice. */
  timeControl?: TimeControl;
}

/** Single-player entry: build a local session, then mount the shared game view. */
export function makeChess(opts: ChessOptions): Screen {
  return (ctx) => {
    const session = createLocalSession({
      mode: opts.mode,
      humanColor: opts.humanColor,
      humanDeck: deckForMatch(opts.mode),
      aiDeck: draftAiDeck(opts.mode),
      search: opts.search,
    });
    const control = opts.timeControl ?? timeControlById(getTimeControlId());
    return mountGame(ctx, session, () => ctx.navigate(menuScreen), control);
  };
}

/** How long the final position stays visible before the result card covers it. */
const GAME_OVER_DELAY_MS = 1100;

const COUNTER_REASON: Record<CounterTrigger, string> = {
  move: "counter.trigMove",
  capture: "counter.trigCapture",
  skill: "counter.trigSkill",
  summon: "counter.trigSummon",
  check: "counter.trigCheck",
  checkmate: "counter.trigCheckmate",
  terrain: "counter.trigTerrain",
  enchant: "counter.trigEnchant",
};

/**
 * The shared game screen — a duel field rather than a stack of panels.
 *
 * Top to bottom: the opponent's nameplate and their hand as card backs, the
 * board, the turn's steps spelled out across the middle, then your own plate
 * and your hand. Everything that is commentary rather than control — the action
 * feed, the card currently being answered — sits in the margins beside the
 * board, so the board itself gets every pixel of height the screen can spare.
 *
 * It never mutates game state: it renders the session's MatchState and turns
 * clicks into Actions, identically for a local AI session and an online one,
 * and for all three modes — the card furniture simply does not appear when the
 * mode has no deck.
 */
export interface GameViewOptions {
  /** A ladder match: the result moves the player's rank when it ends. */
  ranked?: boolean;
  /**
   * The opponent's account nickname. Absent for an AI game, and for a human
   * playing signed out — both fall back to the generic "Opponent" plate.
   */
  opponentName?: string;
}

export function mountGame(
  ctx: AppContext,
  session: Session,
  onExit: () => void,
  control: TimeControl = timeControlById(getTimeControlId()),
  view: GameViewOptions = {},
): () => void {
  const me = session.myColor;
  const opp = opposite(me);
  const flipped = me === "b";
  const myName = getNickname();
  const oppName = view.opponentName?.trim() || t("game.opponent");

  // Purely local UI state (never leaves the client). Targeting itself is not
  // here: the engine owns which card is waiting on what, and this screen only
  // reads that pending step and turns clicks into `target` actions.
  let selected: Square | null = null;
  let freeMoveSource: Square | null = null;
  // Game-over / rematch UI state (client-only).
  let gameOverUp = false;
  let rematchPending = false;
  let opponentLeft = false;
  // The overlay covers the board, so it waits a beat — otherwise the mating move
  // is hidden behind the result card the instant it is played.
  let overlayTimer: number | undefined;

  const canvas = el("canvas", { class: "board-canvas" }) as HTMLCanvasElement;
  canvas.width = 640;
  canvas.height = 640;
  const overlay = el("div", { class: "game-overlay hidden" });
  const oppPlate = el("div", { class: "seat-plate opp" });
  const myPlate = el("div", { class: "seat-plate me" });
  // Deck, graveyard and the cards left standing on the field — the three piles
  // a card game is actually played out of.
  const oppZones = el("div", { class: "zone-block opp" });
  const myZones = el("div", { class: "zone-block me" });
  const oppHand = el("div", { class: "hand-rail opp-hand" });
  const myHand = el("div", { class: "hand-rail my-hand" });
  const phaseTrack = el("div", { class: "phase-track" });
  const stepPanel = el("div", { class: "step-panel hidden" });
  // A decision — take the draw or not, answer a counter or not — goes in the
  // middle of the screen where it cannot be missed. Only the steps that are
  // answered by clicking the board stay off to the side.
  const stepModal = el("div", { class: "duel-modal hidden" });
  const toast = el("div", { class: "toast hidden" });
  // Everything that happens, said out loud: cards played, pieces summoned,
  // cards drawn and destroyed. A card game where effects resolve silently is a
  // card game nobody can follow.
  const actionLog = el("div", { class: "action-log" });
  // Whose turn it is, announced over the board and then gone. A line of text
  // that is always on screen stops being read; a card that appears when the
  // turn changes is read every time.
  const turnBanner = el("div", { class: "turn-banner hidden" });
  const cutIn = createCutIn();

  const timed = !isUntimed(control);
  const oppClock = el("div", { class: "clock-face" });
  const myClock = el("div", { class: "clock-face" });

  const mode = session.getState().mode;
  const carded = usesCards(mode);

  // Sound is punctuation, and punctuation you cannot turn off is noise. The
  // switch rides on the duel bar because the table is where you notice you want
  // it — the same setting is on the profile screen for the rest of the app.
  const soundToggle = el("button", { class: "duel-sound", attrs: { title: t("sound.toggle") } });
  const paintSound = (): void => {
    const off = isMuted();
    soundToggle.classList.toggle("off", off);
    soundToggle.textContent = off ? "🔇" : "🔊";
    soundToggle.setAttribute("aria-pressed", off ? "true" : "false");
  };
  soundToggle.onclick = () => {
    setMuted(!isMuted());
    paintSound();
    // Unmuting with no sound to show for it is indistinguishable from a dead
    // button, so the click answers for itself.
    if (!isMuted()) { primeAudio(); playSfx("select"); }
  };
  paintSound();

  // The plates and the commentary live in the margins beside the board, not in
  // rows above and below it: every row stacked into the column is height the
  // board does not get, and on a wide screen the margins are free.
  const screen = el("div", { class: `screen duel-screen${carded ? " carded" : ""}` }, [
      el("div", { class: "duel-top" }, [
        el("button", { class: "duel-exit", text: t("common.leave"), onclick: () => tryLeave() }),
        el("span", { class: "game-mode-chip", text: modeName(mode) }),
        soundToggle,
      ]),
      oppHand,
      // The turn's steps live in the right margin rather than in a row of their
      // own between the board and the hand. That row cost the board 58px of
      // height on every screen, and the margin it moved into was empty — so the
      // board grew and the phase got read as a checklist instead of a strip.
      el("div", { class: "duel-arena" }, [
        el("div", { class: "duel-flank left" }, [
          el("div", { class: "seat-side opp" }, [oppPlate, oppZones]),
          el("div", { class: "seat-side me" }, [myZones, myPlate]),
        ]),
        el("div", { class: "board-wrap" }, [canvas, overlay, turnBanner]),
        el("div", { class: "duel-flank right" }, [phaseTrack, stepPanel, actionLog]),
      ]),
      myHand,
      stepModal,
      cutIn.node,
      toast,
  ]);
  ctx.root.appendChild(screen);

  const clock: Clock = createClock(control);
  const renderer = new BoardRenderer(canvas);

  /**
   * The board as it was last painted, so the next state can be told apart from
   * it. Diffing the board rather than reading the move out of the action is what
   * makes a card that slides a piece animate like a move — 질주, 밀쳐내기,
   * 위치 교환 and a summon are all board changes and none of them is a move.
   */
  let shownBoard: (Piece | null)[] = state().chess.board.slice();
  let lastMove: { from: Square; to: Square } | null = null;

  /** What changed between the painted board and this one, as animations. */
  function diffBoard(next: (Piece | null)[]): BoardAnim[] {
    const same = (a: Piece | null | undefined, b: Piece | null | undefined) =>
      (!a && !b) || (!!a && !!b && a.color === b.color && a.type === b.type);
    const left: number[] = [];
    const arrived: number[] = [];
    for (let sq = 0; sq < Math.max(shownBoard.length, next.length); sq++) {
      const was = shownBoard[sq] ?? null;
      const now = next[sq] ?? null;
      if (same(was, now)) continue;
      if (was) left.push(sq);
      if (now) arrived.push(sq);
    }
    if (left.length === 0 && arrived.length === 0) return [];

    const anims: BoardAnim[] = [];
    const takenFrom = new Set<number>();
    // Pair each arrival with a departure of the same piece. Nearest first, so a
    // position where two identical pieces both moved does not cross them over.
    for (const to of arrived) {
      const piece = next[to]!;
      const from = left
        .filter((sq) => !takenFrom.has(sq) && same(shownBoard[sq], piece))
        .sort((a, b) => squareDistance(a, to) - squareDistance(b, to))[0];
      if (from === undefined) {
        anims.push({ kind: "spawn", sq: to, piece });
        continue;
      }
      takenFrom.add(from);
      anims.push({ kind: "move", from, to, piece });
    }
    // Whatever left without arriving anywhere died where it stood.
    for (const from of left) {
      if (takenFrom.has(from)) continue;
      anims.push({ kind: "slain", sq: from, piece: shownBoard[from]! });
    }
    return anims;
  }

  /**
   * Squares that have picked up an enchant or a patch of terrain since the last
   * paint. An enchant landing moves nothing, so without a flash of its own the
   * only sign a 4-cost card resolved is a small badge appearing in a corner.
   */
  let shownMarks = new Set<Square>();
  function newlyMarked(): Square[] {
    const now = new Set(boardMarks().map((m) => m.sq));
    const fresh = [...now].filter((sq) => !shownMarks.has(sq));
    shownMarks = now;
    return fresh;
  }

  /** Chebyshev distance, which is how a board measures "nearest". */
  function squareDistance(a: Square, b: Square): number {
    const s = state().chess;
    return Math.max(Math.abs(fileOf(a, s) - fileOf(b, s)), Math.abs(rankOf(a, s) - rankOf(b, s)));
  }

  /**
   * Take the new board, animate the difference, and remember the move so the
   * board can keep showing where it came from. `lastMove` was wired through the
   * renderer from the start and never given a value — every repaint passed null,
   * so the highlight that says "this is what just happened" never appeared.
   */
  function absorbBoard(): BoardAnim[] {
    const next = state().chess.board;
    const anims = diffBoard(next);
    const travelled = anims.filter((a): a is Extract<BoardAnim, { kind: "move" }> => a.kind === "move");
    // The longest journey is the move; a card that shuffles several pieces at
    // once has no single "last move" worth ringing.
    if (travelled.length === 1) lastMove = { from: travelled[0]!.from, to: travelled[0]!.to };
    else if (anims.length > 0) lastMove = null;
    shownBoard = next.slice();
    return anims;
  }

  function state(): MatchState {
    return session.getState();
  }
  function cards(): boolean {
    return usesCards(state().mode);
  }
  function actor(): Color {
    const s = state();
    return s.pending ? s.pending.color : s.chess.turn;
  }
  function myTurn(): boolean {
    return state().status === "playing" && actor() === me;
  }
  /** A step is waiting on us specifically — a draw choice, a counter, a drop. */
  function myStep(): MatchState["pending"] | null {
    const p = state().pending;
    return p && p.color === me ? p : null;
  }

  // ── rendering ──────────────────────────────────────────────
  function render(): void {
    const s = state();
    const pending = myStep();
    let rOpts: RenderOptions;

    if (pending?.kind === "free-moves" && freeMoveSource !== null) {
      rOpts = { selected: freeMoveSource, targets: quietDests(freeMoveSource), lastMove, flipped, mine: me };
    } else if (pending?.kind === "summon-place") {
      rOpts = { selected: null, targets: [], lastMove, flipped, mine: me, zone: summonZone(s, me) };
    } else if (pending?.kind === "targeting") {
      rOpts = { selected: pickedSquares(pending)[0] ?? null, targets: targetSquares(pending), lastMove, flipped, mine: me };
    } else if (selected !== null) {
      rOpts = { selected, targets: legalTargets(selected), lastMove, flipped, mine: me };
    } else {
      rOpts = { selected: null, targets: [], lastMove, flipped, mine: me };
    }
    rOpts.stuck = stuckSquares();
    rOpts.marks = boardMarks();

    renderer.render(s.chess, rOpts);
    // A card being admired is not worth a turn spent waiting: the moment the
    // engine wants an answer out of us, the cut-in stands down.
    if (pending) cutIn.dismiss();
    announceTurn();
    renderPlate(oppPlate, opp);
    renderPlate(myPlate, me);
    renderZones(oppZones, opp);
    renderZones(myZones, me);
    renderPhaseTrack();
    renderStepPanel();
    renderHand();
    renderOppHand();

    if (s.status === "ended") { clock.stop(); renderClocks(); scheduleGameOver(); return; }
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = undefined; }
    if (gameOverUp && !opponentLeft) {
      // A rematch started: tear down the game-over card and reset its state.
      gameOverUp = false;
      rematchPending = false;
      overlay.classList.add("hidden");
      overlay.replaceChildren();
      clock.reset();
    }
    syncClock();
  }

  /**
   * Enchants and terrain, as badges on the squares they sit on. An enchant that
   * the board does not show is a rule the player cannot see, so every one gets a
   * glyph — green when it is working for you, red when it is working on you.
   */
  function boardMarks(): NonNullable<RenderOptions["marks"]> {
    const s = state();
    const out: NonNullable<RenderOptions["marks"]> = [];
    for (const e of s.enchants) {
      if (e.on.kind === "player") continue;
      // A buried mine belongs to whoever laid it; the other side gets no hint.
      if (e.card === "mine" && e.owner !== me) continue;
      out.push({
        sq: e.on.sq,
        glyph: skillIcon(e.card),
        token: cardToken(e.card),
        tone: e.owner === me ? "good" : "bad",
      });
    }
    for (const color of [me, opp] as Color[]) {
      for (const l of s.players[color].lasting) {
        if (l.sq === undefined) continue;
        out.push({
          sq: l.sq,
          glyph: skillIcon(l.card),
          token: cardToken(l.card),
          tone: color === me ? "good" : "bad",
        });
      }
    }
    return out;
  }

  /** Our own pieces that cannot move right now, so the board can say so. */
  function stuckSquares(): Square[] {
    const s = state();
    const out = new Set<Square>(s.players[me].summonSick);
    for (const [sq, rule] of Object.entries(s.rules.squareRules ?? {})) {
      if (!rule.immobile) continue;
      const n = Number(sq);
      if (s.chess.board[n]?.color === me) out.add(n);
    }
    return [...out];
  }

  // ── clocks ─────────────────────────────────────────────────
  /** Park the running clock on whoever the engine is waiting for. Idempotent,
   *  so it can ride along with every repaint. */
  function syncClock(): void {
    if (!timed) return;
    const server = session.clocks();
    if (server) clock.sync(server.w, server.b);
    clock.switchTo(actor());
    renderClocks();
  }

  function renderClocks(): void {
    if (!timed) return;
    paintFace(myClock, me);
    paintFace(oppClock, opp);
  }

  function paintFace(node: HTMLElement, who: Color): void {
    const side = clock.read(who);
    // In byoyomi the period is the number that matters — the main clock is
    // already at zero and showing it would read as "you have lost".
    const inByoyomi = side.byoyomiMs !== null;
    const ms = inByoyomi ? side.byoyomiMs! : side.mainMs;
    node.textContent = formatClock(ms);
    node.classList.toggle("running", clock.running() === who);
    node.classList.toggle("low", ms <= 10_000);
    node.classList.toggle("byoyomi", inByoyomi);
  }

  // ── the nameplates ─────────────────────────────────────────
  /**
   * One side's standing: who they are, what they can spend, how much deck is
   * left, and what they have in play. Both plates are built the same way, which
   * is the point — a resource you can see on yourself and not on the opponent
   * is a resource you cannot plan against.
   */
  function renderPlate(node: HTMLElement, who: Color): void {
    const s = state();
    const p = s.players[who];
    const mine = who === me;
    const cap = modeRules(s.mode).costCap;

    node.classList.toggle("active", s.status === "playing" && actor() === who);

    // The clock rides on the head row, beside the name. It used to be the last
    // child of the plate, which made it the first thing to disappear when the
    // margin ran out of height — on a 768px screen your own clock was cut off
    // the board entirely.
    const bits: (Node | null)[] = [
      el("div", { class: "plate-head" }, [
        icon("avatar", "plate-avatar"),
        el("div", { class: "plate-id" }, [
          el("span", { class: "plate-name", text: mine ? myName : oppName }),
          el("span", { class: "plate-side", text: who === "w" ? t("game.white") : t("game.black") }),
        ]),
        timed ? (mine ? myClock : oppClock) : null,
      ].filter((n): n is HTMLElement => !!n)),
    ];

    // The piles used to be chips here; they are real zones now (renderZones),
    // so the plate is down to identity, money and the clock.
    if (cards()) {
      // Cost granted for this turn only (준비 태세, the gambling den's better
      // rolls) is shown beside the bank rather than folded into it. The plate used
      // to print `p.cost` alone, so playing a card that reads "이번 턴 코스트 +2"
      // spent 1 and moved the number *down* — the grant was real and spendable,
      // and the only place in the game that never mentioned it was the one place
      // you look to see what you can afford.
      bits.push(
        el("div", { class: "plate-cost" }, [
          el("div", { class: "cost-pips" }, [
            ...Array.from({ length: cap }, (_, i) => el("i", { class: i < p.cost ? "on" : "" })),
            ...Array.from({ length: p.bonusCost }, () => el("i", { class: "bonus" })),
          ]),
          el("span", { class: "plate-num", text: `${p.cost}/${cap}` }),
          p.bonusCost > 0
            ? el("span", { class: "plate-bonus", text: `+${p.bonusCost}` })
            : null,
        ].filter((n): n is HTMLElement => !!n)),
      );
    }

    node.replaceChildren(...bits.filter((n): n is Node => !!n));
  }

  /**
   * The three piles: the deck you draw from, the graveyard used and destroyed
   * cards fall into, and the field where 지속 cards sit while they are changing
   * the rules. Both sides get all three — a lasting card is public because it
   * is rewriting the game both players are playing.
   */
  function renderZones(node: HTMLElement, who: Color): void {
    const s = state();
    const p = s.players[who];
    const mine = who === me;
    if (!cards()) {
      node.replaceChildren();
      node.classList.add("hidden");
      return;
    }
    node.classList.remove("hidden");

    // Your own deck is the draw: on your draw step it lights up and takes the
    // click, which is the one moment the deck is a thing you touch.
    const canDraw = mine && myTurn() && !s.pending && s.phase === "draw";
    const deck = el("button", {
      class: `zone zone-deck${canDraw ? " ready" : ""}${p.library.length === 0 ? " spent" : ""}`,
    }, [
      el("div", { class: "zone-stack" }, [p.library.length > 0 ? cardBackEl("xs") : null]),
      el("span", { class: "zone-label", text: t("zone.deck") }),
      el("span", { class: "zone-count", text: String(p.library.length) }),
    ]);
    // The ring and the "덱을 클릭하세요" line in the step panel say this now, so
    // the pill that used to hang under the pile is gone — it sat on top of the
    // field row below it.
    if (canDraw) deck.onclick = () => session.dispatch({ type: "draw" });

    const top = p.discard[p.discard.length - 1];
    const grave = el("button", { class: "zone zone-grave" }, [
      el("div", { class: "zone-stack" }, [top ? cardEl(top, "xs") : null]),
      el("span", { class: "zone-label", text: t("zone.grave") }),
      el("span", { class: "zone-count", text: String(p.discard.length) }),
    ]);
    grave.onclick = () => openPileView(`${mine ? t("game.you") : t("game.opponent")} · ${t("zone.grave")}`, p.discard);

    // An empty field is one line, not a box: two sides' worth of dashed
    // "nothing here" was 100px of the margin's height, and the margin is where
    // the nameplates live.
    const field = el("div", { class: `zone-field${p.lasting.length === 0 ? " empty" : ""}` }, [
      el("span", { class: "zone-label", text: t("zone.field") }),
      p.lasting.length === 0
        ? el("span", { class: "zone-none", text: t("zone.none") })
        : el("div", { class: "zone-field-cards" },
            p.lasting.map((l) => {
              const card = cardEl(l.card, "xs");
              card.classList.add("field-card");
              card.onclick = () => openCardZoom({ card: l.card });
              return card;
            }),
          ),
    ]);

    node.replaceChildren(el("div", { class: "zone-row" }, [deck, grave]), field);
    fitNames(node);
  }

  // ── the turn's steps ───────────────────────────────────────
  /**
   * The turn spelled out across the middle of the screen: whose turn it is,
   * then draw → summon → skill → move → end, with the current step lit. It is
   * also the control for moving on — the trailing button advances the phase,
   * and on the last step it ends the turn.
   */
  function renderPhaseTrack(): void {
    const s = state();
    const mineNow = myTurn() && !s.pending;
    const turnMine = actor() === me;

    // The step is also published on the screen root, so the region you are meant
    // to be clicking can light up: the deck on the draw, your hand on the skill
    // step, the board on the move. A step you have to read about is a step you
    // have to be taught; a step that glows is one you can see.
    screen.dataset.step = mineNow && s.status === "playing" ? s.phase : "";

    const nodes: (Node | null)[] = [
      el("div", { class: `track-turn ${turnMine ? "mine" : "theirs"}` }, [
        el("span", { class: "track-turn-dot" }),
        el("span", { text: turnMine ? t("game.turnMine") : t("game.turnTheirs") }),
      ]),
    ];

    if (!cards() || s.status !== "playing") {
      phaseTrack.classList.add("simple");
      phaseTrack.replaceChildren(...nodes.filter((n): n is Node => !!n));
      return;
    }
    phaseTrack.classList.remove("simple");

    const steps: { key: MatchState["phase"]; label: string }[] = [
      { key: "draw", label: t("play.phaseDraw") },
      ...(modeRules(s.mode).pieceCards ? [{ key: "summon" as const, label: t("play.phaseSummon") }] : []),
      { key: "skill", label: t("play.phaseSkill") },
      { key: "move", label: t("play.phaseMove") },
    ];

    // What the click actually is, spelled out on the step you are standing on.
    // The labels named the steps from the start and never said what to do with
    // them, so "스킬 카드" was a heading rather than an instruction.
    const TODO: Record<MatchState["phase"], string> = {
      draw: "play.doDraw",
      summon: "play.doSummon",
      skill: "play.doSkill",
      move: "play.doMove",
    };

    for (const step of steps) {
      const on = s.phase === step.key;
      const spent = s.moveSpent && step.key === "move";
      nodes.push(
        el("div", {
          class: `track-step${on ? " on" : ""}${on && turnMine ? " mine" : ""}${spent ? " spent" : ""}`,
        }, [
          icon(`phase-${step.key}` as IconName, "track-icon"),
          el("div", { class: "track-text" }, [
            el("span", { class: "track-label", text: step.label }),
            on && !spent
              ? el("span", {
                  class: "track-todo",
                  text: mineNow ? t(TODO[step.key] as never) : t("play.waitTheirs"),
                })
              : null,
          ].filter((n): n is HTMLElement => !!n)),
        ]),
      );
    }

    // Passing is only offered while there is a later step to reach; on the move
    // step the same button becomes "end turn", which is what it actually does.
    nodes.push(
      mineNow
        ? el("button", {
            class: `track-end${s.phase === "move" ? " final" : ""}`,
            text: s.phase === "move" ? t("game.endTurn") : t("play.next"),
            onclick: () => session.dispatch(s.phase === "move" ? { type: "end-turn" } : { type: "pass-phase" }),
          })
        : el("div", { class: "track-step waiting" }, [
            el("span", { class: "track-label", text: t("game.endTurn") }),
          ]),
    );

    phaseTrack.replaceChildren(...nodes.filter((n): n is Node => !!n));
  }

  // ── the step that is blocking ──────────────────────────────
  /**
   * The one thing the game is waiting on.
   *
   * Where it goes depends on how it is answered. A question you settle with a
   * button — take the draw or not, answer this counter or not — goes in the
   * middle of the screen, because a decision tucked into a margin is a decision
   * players miss. A step you answer by clicking the board stays in the margin,
   * because the board is what you need to be looking at.
   */
  function renderStepPanel(): void {
    const pending = myStep();
    stepPanel.replaceChildren();
    stepPanel.classList.add("hidden");
    stepModal.replaceChildren();
    stepModal.classList.add("hidden");
    if (!pending) return;

    if (pending.kind === "targeting") return renderTargetPanel(pending);

    if (pending.kind === "free-moves") {
      return fill("side", t("play.freeMovesTitle"), t("play.freeMoves").replace("{n}", String(pending.movesLeft)), [
        el("button", { class: "btn btn-primary btn-small", text: t("game.endTurn"), onclick: () => session.dispatch({ type: "free-move-end" }) }),
      ]);
    }

    if (pending.kind === "summon-place") {
      return fill("side", t("play.phaseSummon"), t("summon.pick"), []);
    }

    // Pitching is answered from the hand, and the modal does not cover it —
    // the rail sits below where the panel lands.
    if (pending.kind === "discard") {
      return fill("centre", t("draw.pick"), t("draw.pickBody"), []);
    }

    if (pending.kind === "arrange") {
      // 점술: the looked-at cards go back in the order they are clicked, and the
      // last one clicked is the one the next draw takes.
      const order: number[] = [];
      const row = el("div", { class: "step-cards" });
      const paint = (): void => {
        row.replaceChildren(
          ...pending.cards.map((id, i) => {
            const node = cardEl(id, "sm");
            node.classList.add("step-card", order.includes(i) ? "blocked" : "playable");
            const at = order.indexOf(i);
            if (at >= 0) node.appendChild(el("span", { class: "card-block", text: `#${order.length - at}` }));
            node.onclick = () => {
              if (order.includes(i)) return;
              order.unshift(i); // clicked first = drawn first = on top
              if (order.length === pending.cards.length) session.dispatch({ type: "arrange", order });
              else paint();
            };
            return node;
          }),
        );
        fitNames(row);
      };
      paint();
      return fill("centre", t("play.arrangeTitle"), t("play.arrange"), [row]);
    }

    if (pending.kind === "draw-choice") {
      return fill("centre", t("draw.title"), t("draw.body").replace("{n}", String(state().players[me].hand.length)), [
        el("button", { class: "btn btn-ghost", text: t("draw.skip"), onclick: () => session.dispatch({ type: "draw-skip" }) }),
        el("button", { class: "btn btn-primary", text: t("draw.take"), onclick: () => session.dispatch({ type: "draw-take" }) }),
      ]);
    }

    // A counter window. The cards that actually answer it are laid out here
    // rather than left to be hunted for in the hand — the window closes, and
    // "which of my cards was a counter again" is not a decision, it is a
    // memory test.
    if (pending.kind !== "counter") return;
    const s = state();
    const p = s.players[me];
    const purse = p.cost + p.bonusCost;
    const answers = p.hand
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => {
        const meta = skillMeta(id);
        return meta?.speed === "counter"
          && meta.trigger === pending.trigger
          && cardCost(id, s, me) <= purse;
      });

    const controls: (Node | null)[] = [];
    if (answers.length === 0) {
      controls.push(el("span", { class: "step-note", text: t("counter.none") }));
    } else {
      controls.push(
        el("div", { class: "step-cards" },
          answers.map(({ id, index }) => {
            const node = cardEl(id, "sm");
            node.classList.add("step-card", "playable");
            node.onclick = () => onHandClick(id, index);
            return node;
          }),
        ),
      );
    }
    controls.push(el("button", { class: "btn btn-ghost", text: t("counter.pass"), onclick: () => session.dispatch({ type: "counter-pass" }) }));
    fill("centre", t("counter.title"), t(COUNTER_REASON[pending.trigger] as never), controls, "urgent");
  }

  /** Lay out the step panel, in the margin or in the middle of the screen. */
  function fill(where: "side" | "centre", title: string, body: string, controls: (Node | null)[], tone = ""): void {
    const host = where === "centre" ? stepModal : stepPanel;
    host.className = where === "centre" ? `duel-modal ${tone}`.trim() : `step-panel ${tone}`.trim();
    host.replaceChildren(
      el("div", { class: "step-card-panel" }, [
        el("div", { class: "step-title", text: title }),
        el("div", { class: "step-body", text: body }),
        el("div", { class: "step-controls" }, controls),
      ]),
    );
    fitNames(host);
  }

  /**
   * What a card is waiting for. Squares are picked on the board; everything
   * else — a card in a pile, one of a fixed set of answers — is picked here.
   */
  function renderTargetPanel(p: Targeting): void {
    const spec = currentSpec(p);
    const controls: (Node | null)[] = [];

    if (spec?.kinds.includes("choice")) {
      for (const option of spec.options ?? []) {
        controls.push(el("button", {
          class: "btn btn-primary btn-small",
          text: t(`option.${option}` as never),
          onclick: () => pick({ type: "target", option }),
        }));
      }
    }

    if (spec?.kinds.includes("discard")) {
      const pile = state().players[me].discard;
      controls.push(
        pile.length === 0
          ? el("span", { class: "step-note", text: t("play.discardEmpty") })
          : el("div", { class: "step-cards" },
              pile.map((id, i) => {
                const node = cardEl(id, "sm");
                node.classList.add("step-card", "playable");
                node.onclick = () => pick({ type: "target", index: i });
                return node;
              }),
            ),
      );
    }

    // A card in the opponent's hand is answered here too, not only by hunting
    // for the right 58px card back at the top edge of the screen. Ones a skill
    // has already looked at are face up; the rest are backs, in hand order.
    if (spec?.kinds.includes("opp-hand")) {
      const s = state();
      const oppCards = s.players[opp].hand;
      const seen = new Set(s.players[me].revealed);
      controls.push(
        oppCards.length === 0
          ? el("span", { class: "step-note", text: t("play.handEmpty") })
          : el("div", { class: "step-cards" },
              oppCards.map((id, i) => {
                const known = seen.has(i) && id !== "hidden";
                const node = known ? cardEl(id, "sm") : cardBackEl("sm");
                node.classList.add("step-card", "playable");
                node.onclick = () => pick({ type: "target", index: i });
                return node;
              }),
            ),
      );
    }

    // Same for a card in your own hand: the rail below is dimmed while a card
    // is casting, which reads as "not now" exactly when it means "pick one".
    if (spec?.kinds.includes("own-hand")) {
      const hand = state().players[me].hand;
      controls.push(
        hand.length === 0
          ? el("span", { class: "step-note", text: t("play.handEmpty") })
          : el("div", { class: "step-cards" },
              hand.map((id, i) => {
                const node = cardEl(id, "sm");
                node.classList.add("step-card", "playable");
                node.onclick = () => pick({ type: "target", index: i });
                return node;
              }),
            ),
      );
    }

    if (spec?.kinds.includes("lasting")) {
      for (const color of [me, opp] as Color[]) {
        for (const l of state().players[color].lasting) {
          controls.push(el("button", {
            class: "btn btn-ghost btn-small",
            text: `${color === me ? "▲" : "▼"} ${cardName(l.card)}`,
            // Its own field, not `index`: 파괴 offers a lasting card and a card
            // in hand side by side, and a bare number cannot say which.
            onclick: () => pick({ type: "target", lasting: l.id }),
          }));
        }
      }
    }

    // A step that takes a range of picks needs a way to say "that is enough".
    if (spec && spec.max > spec.min) {
      controls.push(el("button", {
        class: "btn btn-primary btn-small",
        text: t("target.done"),
        onclick: () => pick({ type: "target-done" }),
      }));
    }
    controls.push(el("button", {
      class: "btn btn-ghost btn-small",
      text: t("common.cancel"),
      onclick: () => pick({ type: "target-cancel" }),
    }));

    // A step answered by picking one of a handful of written answers is a
    // decision like any other, so it gets the middle of the screen; a step
    // answered by clicking a square stays out of the board's way.
    const written = !!spec && !spec.kinds.some((k) => k === "own-piece" || k === "enemy-piece" || k === "empty");
    fill(written ? "centre" : "side", cardName(p.card), targetPrompt(p), controls, "casting");
  }

  // ── the hands ──────────────────────────────────────────────
  /** Why a card in hand cannot be played right now, or null if it can. */
  function blockedReason(cardId: string, index: number): string | null {
    const s = state();
    const p = s.players[me];
    const pending = myStep();

    // A card being fished for by another card is judged by that card's step,
    // not by what it would cost to play.
    if (pending?.kind === "targeting") {
      return currentSpec(pending)?.kinds.includes("own-hand") ? null : t("play.targeting");
    }
    if (p.cost + p.bonusCost < cardCost(cardId, s, me)) return t("play.tooExpensive");

    if (pending?.kind === "counter") {
      const meta = skillMeta(cardId);
      if (!meta || meta.speed !== "counter" || meta.trigger !== pending.trigger) {
        return t("play.counterOnly");
      }
      return null;
    }
    if (pending?.kind === "discard") return null; // any card may be pitched

    if (!myTurn() || s.pending) return t("game.oppTurn");

    if (isPieceCard(cardId)) {
      if (!modeRules(s.mode).pieceCards) return t("play.counterOnly");
      if (s.phase !== "summon") return t("play.phaseSummon");
      return summonZone(s, me).length === 0 ? t("summon.pick") : null;
    }
    const meta = skillMeta(cardId);
    if (!meta) return t("play.counterOnly");
    if (meta.speed === "counter") return t("play.counterOnly");
    if (s.phase !== "summon" && s.phase !== "skill") return t("play.phaseSkill");
    // 속공 is outside the one-card-a-turn limit; cost is the only thing that
    // holds it back. Mirror the engine here or the rail greys out cards the
    // engine would have accepted.
    if (meta.speed !== "quick" && s.skillsPlayed >= 1) return t("play.oneSkill");
    void index;
    return null;
  }

  /**
   * A hand rail is rebuilt from scratch, which would restart — or cut short —
   * the deal animation on every repaint, and a match repaints many times a
   * turn for the clock alone. So each rail remembers what it last drew and
   * skips the rebuild when nothing about it changed, and holds off entirely
   * while cards are still in the air.
   */
  interface Rail {
    sig: string;
    /** How many cards this rail has settled, so only the new ones fly in. */
    dealt: number;
    /** When the cards currently in flight will have landed. */
    busyUntil: number;
    /**
     * Draws the engine has reported since this rail last settled.
     *
     * Growth in hand size is not the same thing. 헌납 pitches a card and then
     * draws two, so the hand goes 5 → 6 and one arrival gets animated for two
     * cards drawn — you cannot count what you were dealt if the deal does not
     * show all of it. The engine already says `drew` once per card, so that is
     * what the deal is built from, and the size change is only the floor.
     */
    drew: number;
    retry?: number;
  }
  const mineRail: Rail = { sig: "", dealt: 0, busyUntil: 0, drew: 0 };
  const theirsRail: Rail = { sig: "", dealt: 0, busyUntil: 0, drew: 0 };

  /** How many cards are freshly in this hand, and where they start. */
  function freshCount(rail: Rail, handLength: number): number {
    const grew = Math.max(0, handLength - rail.dealt);
    const fresh = Math.min(handLength, Math.max(grew, rail.drew));
    rail.drew = 0;
    rail.dealt = handLength;
    return fresh;
  }

  /** True when the caller should back off and let a deal finish first. */
  function railBusy(rail: Rail, repaint: () => void): boolean {
    const wait = rail.busyUntil - Date.now();
    if (wait <= 0) return false;
    if (rail.retry === undefined) {
      rail.retry = window.setTimeout(() => { rail.retry = undefined; repaint(); }, wait + 20);
    }
    return true;
  }

  function renderHand(): void {
    const s = state();
    if (!cards()) {
      if (mineRail.sig === "-") return;
      mineRail.sig = "-";
      myHand.replaceChildren();
      return;
    }
    const hand = s.players[me].hand;
    const pending = myStep();
    const discarding = pending?.kind === "discard";
    const casting = pending?.kind === "targeting" ? pending.card : "";

    const blocks = hand.map((id, i) => blockedReason(id, i) ?? "");
    const sig = `${hand.join(",")}|${blocks.join(",")}|${discarding}|${casting}`;
    if (sig === mineRail.sig) return;
    if (railBusy(mineRail, renderHand)) return;
    mineRail.sig = sig;

    // Cards are pushed onto the end of the hand, so anything past the count we
    // last settled is freshly drawn and gets to fly out of the deck.
    const firstFresh = hand.length - freshCount(mineRail, hand.length);

    if (hand.length === 0) {
      myHand.replaceChildren(el("div", { class: "hand-empty", text: t("play.handEmpty") }));
      return;
    }

    const slots = hand.map((cardId, i) => {
      const blocked = blocks[i];
      const node = cardEl(cardId, "sm");
      // Which step this card belongs to, so only the cards the current step is
      // asking for light up. The summon step lets a skill card through too, but
      // beckoning with both is beckoning with neither — the glow points at the
      // step's own cards and the rest stay quiet without being blocked.
      node.classList.add("hand-card", isPieceCard(cardId) ? "kind-piece" : "kind-skill");
      node.classList.toggle("playable", !blocked);
      node.classList.toggle("blocked", !!blocked);
      if (discarding) node.classList.add("pitchable");
      if (casting === cardId) node.classList.add("casting");
      if (blocked) node.appendChild(el("span", { class: "card-block", text: blocked }));
      node.onclick = () => onHandClick(cardId, i);
      if (i >= firstFresh) node.classList.add("pre-deal");

      const slot = el("div", { class: "hand-slot" }, [node]);
      slot.style.setProperty("--i", String(i));
      slot.style.setProperty("--n", String(hand.length));
      return slot;
    });

    myHand.replaceChildren(...slots);
    fitNames(myHand);
    dealIn(slots.slice(firstFresh).map((s2) => s2.firstElementChild as HTMLElement), myZones, mineRail);
  }

  function renderOppHand(): void {
    const s = state();
    if (!cards()) {
      if (theirsRail.sig === "-") return;
      theirsRail.sig = "-";
      oppHand.replaceChildren();
      return;
    }
    const hand = s.players[opp].hand;
    const revealed = new Set(s.players[me].revealed);
    const pending = myStep();
    // A card that is asking about the opponent's hand turns these into buttons.
    const pickable = pending?.kind === "targeting" && !!currentSpec(pending)?.kinds.includes("opp-hand");

    const faces = hand.map((id, i) => (revealed.has(i) && id !== "hidden" ? id : ""));
    const sig = `${faces.join(",")}|${hand.length}|${pickable}`;
    if (sig === theirsRail.sig) return;
    if (railBusy(theirsRail, renderOppHand)) return;
    theirsRail.sig = sig;

    const firstFresh = hand.length - freshCount(theirsRail, hand.length);

    if (hand.length === 0) {
      oppHand.replaceChildren(el("div", { class: "hand-empty", text: t("play.handEmpty") }));
      return;
    }

    const slots = hand.map((id, i) => {
      const face = faces[i];
      // A card a skill has looked at stays looked at — it is drawn face up, and
      // the flip is what tells you it just happened.
      const node = face ? cardEl(face, "sm") : cardBackEl("sm");
      node.classList.add("hand-card", "opp-hand-card");
      if (face) node.classList.add("revealed");
      if (pickable) node.classList.add("peekable");
      // A card you have seen stays inspectable; a face-down one has nothing to
      // open, so it takes the pick straight away.
      if (face) {
        node.onclick = () => openCardZoom({
          card: face,
          actions: pickable ? [{ label: t("zoom.choose"), primary: true, run: () => pick({ type: "target", index: i }) }] : [],
        });
      } else if (pickable) {
        node.onclick = () => pick({ type: "target", index: i });
      }
      if (i >= firstFresh) node.classList.add("pre-deal");

      const slot = el("div", { class: "hand-slot" }, [node]);
      slot.style.setProperty("--i", String(i));
      slot.style.setProperty("--n", String(hand.length));
      return slot;
    });

    oppHand.replaceChildren(...slots);
    fitNames(oppHand);
    dealIn(slots.slice(firstFresh).map((s2) => s2.firstElementChild as HTMLElement), oppZones, theirsRail);
  }

  /**
   * Fly freshly drawn cards out of that player's deck counter and into the
   * rail. The offset is measured rather than guessed: a fixed "come in from
   * below" looks like a card appearing, not like a card being drawn.
   *
   * The stagger is longer than the flight is short on purpose. A card that draws
   * two (명상, 헌납) or four (도박장) used to send them all up at once with 130ms
   * between them, so three cards read as one wide movement and the only way to
   * learn how many you had drawn was to count the hand before and after. Each
   * card now leaves the deck after the one before it has landed, and the deck
   * itself counts them off — a deal you can watch is a deal you can count.
   */
  /** Must match the card-deal keyframe's duration and per-card delay in CSS. */
  const DEAL_MS = 440;
  const DEAL_STAGGER_MS = 300;

  function dealIn(fresh: HTMLElement[], zones: HTMLElement, rail: Rail): void {
    if (fresh.length === 0) return;
    rail.busyUntil = Date.now() + DEAL_MS + DEAL_STAGGER_MS * (fresh.length - 1);
    requestAnimationFrame(() => {
      const deck = zones.querySelector(".zone-deck") ?? zones;
      const from = deck.getBoundingClientRect();
      const fx = from.left + from.width / 2;
      const fy = from.top + from.height / 2;
      fresh.forEach((node, k) => {
        const r = node.getBoundingClientRect();
        node.style.setProperty("--fx", `${Math.round(fx - (r.left + r.width / 2))}px`);
        node.style.setProperty("--fy", `${Math.round(fy - (r.top + r.height / 2))}px`);
        node.style.setProperty("--d", String(k));
        node.classList.remove("pre-deal");
        node.classList.add("dealing");
      });
      countOff(deck as HTMLElement, fresh.length);
    });
  }

  /**
   * The deck ticking off the cards it is sending: 1, 2, 3… one number per card,
   * in step with the flight. One "+3" that appears and fades says the same thing
   * in a way you have to already be looking at the deck to catch; a count that
   * climbs is legible from the corner of the eye.
   */
  function countOff(deck: HTMLElement, total: number): void {
    if (total < 2) return;
    for (let k = 0; k < total; k++) {
      window.setTimeout(() => {
        if (!deck.isConnected) return;
        const pip = el("span", { class: "deal-count", text: `${k + 1}` });
        deck.appendChild(pip);
        // Must outlive the .deal-count animation and no more; see the CSS.
        window.setTimeout(() => pip.remove(), 360);
      }, k * DEAL_STAGGER_MS);
    }
  }

  /**
   * Clicking a card in hand opens it, big, with what it does — and the button
   * that commits it. A card in the rail is a hundred pixels wide, which is not
   * enough to read rules text off, so playing one used to mean either knowing
   * the card by heart or finding out after it had resolved.
   */
  function onHandClick(cardId: string, index: number): void {
    const pending = myStep();
    const blocked = blockedReason(cardId, index);
    const actions: ZoomAction[] = [];

    if (!blocked) {
      if (pending?.kind === "targeting") {
        actions.push({ label: t("zoom.choose"), primary: true, run: () => pick({ type: "target", index }) });
      } else if (pending?.kind === "discard") {
        actions.push({ label: t("zoom.discard"), primary: true, run: () => session.dispatch({ type: "discard", index }) });
      } else if (pending?.kind === "counter") {
        actions.push({ label: t("zoom.counter"), primary: true, run: () => session.dispatch({ type: "counter-play", index }) });
      } else {
        const summon = isPieceCard(cardId);
        actions.push({
          label: summon ? t("zoom.summon") : t("zoom.play"),
          primary: true,
          run: () => {
            selected = null;
            // Every card is played the same way; whatever it needs to aim at,
            // the engine asks for next.
            session.dispatch(summon ? { type: "summon", index } : { type: "play-skill", index });
          },
        });
      }
    }

    openCardZoom({ card: cardId, note: blocked, actions });
  }

  /** Motion still owed by the move that ended the match, so the card can wait. */
  let pendingAnimMs = 0;

  function scheduleGameOver(): void {
    if (gameOverUp || overlayTimer) return;
    const wait = GAME_OVER_DELAY_MS + pendingAnimMs;
    pendingAnimMs = 0;
    overlayTimer = window.setTimeout(() => { overlayTimer = undefined; showGameOver(); }, wait);
  }

  /**
   * A ladder match reports its result exactly once. `rankChange` is kept so
   * repainting the card — asking for a rematch, then waiting — does not count
   * the match again.
   */
  let rankChange: RankChange | null = null;
  function recordRankOnce(): void {
    if (!view.ranked || rankChange) return;
    const s = state();
    if (s.status !== "ended") return;
    rankChange = recordRanked(s.winner === "draw" ? "draw" : s.winner === me ? "win" : "loss");
  }

  /** The rating this match moved, under the result. */
  function rankResult(): HTMLElement | null {
    if (!rankChange) return null;
    const { after, delta, promoted, demoted, placedNow } = rankChange;
    const note =
      placedNow ? t("rank.placed")
      : promoted ? t("rank.promoted")
      : demoted ? t("rank.demoted")
      : "";
    return el("div", { class: `overlay-rank${promoted ? " up" : demoted ? " down" : ""}` }, [
      rankBadge(after, "sm"),
      delta !== 0
        ? el("span", { class: `rank-delta ${delta > 0 ? "up" : "down"}`, text: `${delta > 0 ? "+" : ""}${delta} RP` })
        : null,
      note ? el("span", { class: "rank-note", text: note }) : null,
    ]);
  }

  function showGameOver(): void {
    const s = state();
    recordRankOnce();
    const msg =
      s.winner === "draw" ? t("game.draw")
      : s.winner === me ? t("game.victory")
      : t("game.defeat");
    // Why it ended — checkmate, stalemate, resignation… — so a loss is legible.
    const why = s.endReason ? tPassthrough(s.endReason) : "";

    const actions: HTMLElement[] = [];
    if (opponentLeft) {
      actions.push(el("div", { class: "overlay-note", text: t("game.oppLeft") }));
    } else if (rematchPending) {
      actions.push(el("button", { class: "start-btn waiting", text: t("game.waitingOpp") }));
    } else {
      actions.push(el("button", {
        class: "start-btn",
        text: t("game.rematch"),
        // Show the pending state first; a local session restarts synchronously
        // inside rematch() and its fresh state will tear this overlay back down.
        onclick: () => { rematchPending = true; showGameOver(); session.rematch(); },
      }));
    }
    actions.push(el("button", { class: "back-btn", text: t("common.menu"), onclick: () => ctx.navigate(menuScreen) }));

    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: `overlay-msg ${s.winner === me ? "win" : s.winner === "draw" ? "even" : "loss"}`, text: msg }),
        why ? el("div", { class: "overlay-why", text: why }) : null,
        rankResult(),
        el("div", { class: "overlay-actions" }, actions),
      ]),
    );
    overlay.classList.remove("hidden");
    gameOverUp = true;
  }

  /**
   * Leaving mid-match is a resignation, so it asks first. Once the match is
   * over — or the opponent has already walked — there is nothing to forfeit and
   * the button just leaves.
   */
  function tryLeave(): void {
    if (state().status === "ended" || opponentLeft) return onExit();

    overlay.replaceChildren(
      el("div", { class: "overlay-card leave-card" }, [
        el("div", { class: "overlay-msg", text: t("game.leaveTitle") }),
        el("div", { class: "overlay-why", text: t("game.leaveWarn") }),
        el("div", { class: "overlay-actions" }, [
          el("button", {
            class: "back-btn",
            text: t("common.cancel"),
            onclick: () => { overlay.classList.add("hidden"); overlay.replaceChildren(); },
          }),
          el("button", {
            class: "start-btn danger",
            text: t("game.leaveYes"),
            onclick: () => {
              // Resign first: the match should end as a loss whether or not the
              // screen survives long enough to see it.
              session.dispatch({ type: "resign" });
              onExit();
            },
          }),
        ]),
      ]),
    );
    overlay.classList.remove("hidden");
  }

  /** Opponent quit before the match ended — there's no result to show. */
  function showOpponentLeft(): void {
    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: "overlay-msg", text: t("game.oppLeft") }),
        el("div", { class: "overlay-actions" }, [
          el("button", { class: "back-btn", text: t("common.menu"), onclick: () => ctx.navigate(menuScreen) }),
        ]),
      ]),
    );
    overlay.classList.remove("hidden");
    gameOverUp = true;
  }

  // ── highlight helpers ──────────────────────────────────────
  function legalTargets(from: Square): Square[] {
    return generateLegalMoves(state().chess, from, state().rules).map((m) => m.to);
  }
  /** Moves that take nothing — what 희생의 대가 allows. */
  function quietDests(from: Square): Square[] {
    return generateLegalMoves(state().chess, from, state().rules).filter((m) => !m.captured).map((m) => m.to);
  }

  // ── generic targeting ──────────────────────────────────────
  type Targeting = Extract<NonNullable<MatchState["pending"]>, { kind: "targeting" }>;

  /** The spec the card is asking about right now. */
  function currentSpec(p: Targeting): TargetSpec | undefined {
    return skillMeta(p.card)?.targets?.[p.step];
  }

  function pickedSquares(p: Targeting): Square[] {
    return (p.picks[p.step] ?? [])
      .filter((x): x is { kind: "square"; sq: Square } => x.kind === "square")
      .map((x) => x.sq);
  }

  /** Every square this step would accept — the board's own list of options. */
  function targetSquares(p: Targeting): Square[] {
    const spec = currentSpec(p);
    if (!spec) return [];
    const wantsSquare = spec.kinds.some(
      (k: string) => k === "own-piece" || k === "enemy-piece" || k === "empty",
    );
    if (!wantsSquare) return [];
    const s = state();
    const already = new Set(pickedSquares(p));
    const out: Square[] = [];
    for (let sq = 0; sq < s.chess.board.length; sq++) {
      if (already.has(sq)) continue;
      const piece = s.chess.board[sq];
      if (!piece) {
        if (spec.kinds.includes("empty")) out.push(sq);
        continue;
      }
      if (piece.type === "k" && !spec.king) continue;
      if (spec.pieces && !spec.pieces.includes(piece.type)) continue;
      if (spec.kinds.includes("own-piece") && piece.color === me) out.push(sq);
      else if (spec.kinds.includes("enemy-piece") && piece.color !== me) out.push(sq);
    }
    return out;
  }

  function targetPrompt(p: Targeting): string {
    const spec = currentSpec(p);
    return !spec ? t("target.pick")
      : spec.kinds.includes("choice") ? t("target.choice")
      : spec.kinds.includes("empty") && spec.kinds.length === 1 ? t("target.empty")
      : spec.kinds.includes("own-piece") && !spec.kinds.includes("enemy-piece") ? t("target.own")
      : spec.kinds.includes("enemy-piece") && !spec.kinds.includes("own-piece") ? t("target.enemy")
      : spec.kinds.includes("own-hand") ? t("target.ownHand")
      : spec.kinds.includes("opp-hand") ? t("target.oppHand")
      : spec.kinds.includes("discard") ? t("target.discard")
      : spec.kinds.includes("lasting") ? t("target.lasting")
      : t("target.pick");
  }

  const pick = (a: Action): void => session.dispatch(a);

  function handleClick(sq: Square): void {
    const s = state();
    if (s.status === "ended" || opponentLeft) return;

    const pending = myStep();
    if (pending) return handlePending(sq, pending);
    if (s.pending) return; // waiting on the opponent
    if (!myTurn()) return;

    // Pieces move on the move step and nowhere else. The engine enforces this,
    // but a board that silently ignores the click teaches nothing — so say why.
    if (cards() && s.phase !== "move") {
      if (s.chess.board[sq]?.color === me) showToast(t("play.notMoveStep"));
      return;
    }

    handleNormalClick(sq);
  }

  /** Our own piece that is free to be picked up this turn. */
  function movable(sq: Square): boolean {
    const s = state();
    if (cards() && s.phase !== "move") return false;
    const p = s.chess.board[sq];
    if (!p || p.color !== me) return false;
    return !stuckSquares().includes(sq);
  }

  function handleNormalClick(sq: Square): void {
    if (state().moveSpent) return; // a card was played instead of the move
    if (selected === null) {
      if (movable(sq)) { selected = sq; playSfx("select"); render(); }
      return;
    }
    if (sq === selected) { selected = null; return render(); }
    // Switching to another of your own pieces ends the click there. Falling
    // through would ask whether the piece can move onto itself, which it cannot,
    // and drop the selection that was just made.
    if (movable(sq)) { selected = sq; playSfx("select"); return render(); }
    if (legalTargets(selected).includes(sq)) {
      void dispatchMove(selected, sq);
    } else {
      selected = null;
      render();
    }
  }

  async function dispatchMove(from: Square, to: Square): Promise<void> {
    let promotion: PieceType | undefined;
    if (isPromotion(from, to)) promotion = await pickPromotion();
    selected = null;
    session.dispatch({ type: "move", from, to, promotion });
    render();
  }

  function handlePending(sq: Square, p: NonNullable<MatchState["pending"]>): void {
    const board = state().chess.board;

    if (p.kind === "summon-place") {
      if (summonZone(state(), me).includes(sq)) session.dispatch({ type: "summon-place", sq });
      return;
    }
    if (p.kind === "targeting") {
      if (targetSquares(p).includes(sq)) pick({ type: "target", sq });
      return;
    }
    if (p.kind !== "free-moves") return; // draw / discard / counter are answered off-board

    if (freeMoveSource === null) {
      if (board[sq]?.color === me && !p.moved.includes(sq)) { freeMoveSource = sq; render(); }
      return;
    }
    if (sq === freeMoveSource) { freeMoveSource = null; return render(); }
    if (quietDests(freeMoveSource).includes(sq)) {
      const from = freeMoveSource;
      freeMoveSource = null;
      session.dispatch({ type: "free-move", from, to: sq });
      return;
    }
    if (board[sq]?.color === me && !p.moved.includes(sq)) { freeMoveSource = sq; render(); }
    else { freeMoveSource = null; render(); }
  }

  function isPromotion(from: Square, to: Square): boolean {
    return generateLegalMoves(state().chess, from, state().rules).some((m) => m.to === to && !!m.promotion);
  }

  function pickPromotion(): Promise<PieceType> {
    return new Promise((resolve) => {
      const glyphs: Record<string, string> = me === "w"
        ? { q: "♕", r: "♖", b: "♗", n: "♘" } : { q: "♛", r: "♜", b: "♝", n: "♞" };
      overlay.replaceChildren(
        el("div", { class: "promo-overlay" },
          (["q", "r", "b", "n"] as PieceType[]).map((type) =>
            el("button", { class: "promo-btn", text: glyphs[type], onclick: () => { overlay.classList.add("hidden"); overlay.replaceChildren(); resolve(type); } }),
          ),
        ),
      );
      overlay.classList.remove("hidden");
    });
  }

  // ── the action feed ────────────────────────────────────────
  /** How many lines of history the feed keeps on screen. */
  const LOG_LINES = 9;

  /**
   * Turn one engine event into a line of the feed — and, for a card actually
   * being played, into the cut-in that holds that card on screen long enough to
   * read what it does.
   */
  function logEvent(e: MatchEvent): void {
    const who = (color: Color) => (color === me ? t("game.you") : t("game.opponent"));
    let text: string | null = null;
    let cls = "";

    if (e.type === "toast") {
      // The engine's own account of what a card did. It is the only record that
      // an effect resolved at all, so it belongs in the feed and not just in a
      // toast that is gone in a second and a half. The counter window is the
      // exception: it is a prompt, and the prompt is already on screen.
      if (e.text === "fx.counterWindow") return;
      text = tPassthrough(e.text);
      cls = "effect";
    } else if (e.type === "expired") {
      text = t("log.expired").replace("{card}", cardName(e.card));
      cls = "expire";
    } else if (e.type === "slain") {
      text = t("log.slain").replace("{piece}", `${who(e.color)} ${pieceName(e.piece)}`);
      cls = "slain";
    } else if (e.type === "played") {
      const summon = isPieceCard(e.card);
      text = t(summon ? "log.summoned" : "log.played")
        .replace("{who}", who(e.color))
        .replace("{card}", cardName(e.card));
      cls = summon ? "summon" : "play";
      // A card of your own that still needs aiming gets the briefest possible
      // flash: you picked it off a zoomed-up face a second ago, and the panel
      // asking you where to point it is behind the cut-in. The opponent's card
      // is the one you have never seen, so it keeps the full reveal.
      const mine = e.color === me;
      const aiming = mine && needsTargets(e.card);
      cutIn.show({ card: e.card, mine, summon, hold: aiming ? 900 : mine ? 2200 : undefined });
    } else if (e.type === "drew") {
      // The opponent's draw is public as an event, but not as a card.
      const known = e.color === me && e.card !== "hidden";
      text = t(known ? "log.drew" : "log.drewHidden")
        .replace("{who}", who(e.color))
        .replace("{card}", known ? cardName(e.card) : "");
      cls = "draw";
    } else if (e.type === "destroyed") {
      text = t("log.destroyed").replace("{card}", cardName(e.card));
      cls = "destroy";
    } else if (e.type === "dice") {
      text = t("log.dice").replace("{who}", who(e.color)).replace("{n}", String(e.value));
      cls = "dice";
    } else if (e.type === "game-over") {
      text = tPassthrough(e.reason);
      cls = "over";
    }
    if (!text) return;

    actionLog.appendChild(el("div", { class: `log-line ${cls}`, text }));
    while (actionLog.childElementCount > LOG_LINES) actionLog.firstElementChild?.remove();
  }

  /**
   * Announce a turn change once, over the board. `lastActor` is what makes it
   * fire on the change rather than on every repaint — a match repaints many
   * times per turn, for the clock alone.
   */
  let lastActor: Color | null = null;
  let bannerTimer: number | undefined;

  function announceTurn(): void {
    const s = state();
    if (s.status !== "playing") { lastActor = null; return; }
    const who = actor();
    if (who === lastActor) return;
    lastActor = who;

    turnBanner.replaceChildren(
      el("span", {
        class: `turn-text ${who === me ? "mine" : "theirs"}`,
        text: who === me ? t("game.turnMine") : t("game.turnTheirs"),
      }),
    );
    turnBanner.classList.remove("hidden");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      turnBanner.classList.add("hidden");
      turnBanner.replaceChildren();
    }, 1400);
  }

  // ── sound ──────────────────────────────────────────────────
  /**
   * What an event sounds like. The board's own noises are not in here: a move
   * and a capture are told apart by what the board did, not by what the engine
   * said, because 질주 and 밀쳐내기 slide a piece without ever raising a move.
   */
  function eventSound(e: MatchEvent): Sfx | null {
    switch (e.type) {
      case "drew": return "draw";
      case "played": return isPieceCard(e.card) ? "summon" : "play";
      case "destroyed": return "destroy";
      case "expired": return "expire";
      case "dice": return "dice";
      case "game-over":
        return e.winner === "draw" ? "draw-game" : e.winner === me ? "win" : "lose";
      case "toast":
        // The one prompt that is easy to sit and stare past. It is aimed at us
        // or it is not worth a noise.
        return e.text === "fx.counterWindow" && myStep()?.kind === "counter" ? "counter" : null;
      default: return null;
    }
  }

  /**
   * The board's half. A capture is a move that landed where something died, so
   * the two anims have to be read together — playing both would be a click and
   * a thud on top of each other, and playing only `slain` would make a capture
   * sound like a card kill.
   */
  function boardSounds(anims: BoardAnim[]): void {
    const deaths = new Set(anims.filter((a) => a.kind === "slain").map((a) => (a as { sq: Square }).sq));
    let moved = false;
    let took = false;
    for (const a of anims) {
      if (a.kind !== "move") continue;
      moved = true;
      if (deaths.has(a.to)) { took = true; deaths.delete(a.to); }
    }
    if (took) playSfx("capture");
    else if (moved) playSfx("move");
    // Whatever died without a piece arriving on top of it was killed by a card.
    if (deaths.size > 0) playSfx("slain");
  }

  // ── wire up ────────────────────────────────────────────────
  let toastTimer: number | undefined;
  function showToast(text: string): void {
    toast.textContent = tPassthrough(text);
    toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 1600);
  }

  // A rematch deals a fresh opening hand, so the rails have to forget what they
  // were holding — otherwise the new hand slides in without ever being dealt.
  let wasEnded = false;
  /** Whether the side to move is already in check, so it is announced once. */
  let inCheck = false;
  session.subscribe((_s, events) => {
    const live = state().status === "playing";
    if (live && wasEnded) {
      mineRail.dealt = 0; mineRail.sig = ""; mineRail.drew = 0;
      theirsRail.dealt = 0; theirsRail.sig = ""; theirsRail.drew = 0;
      actionLog.replaceChildren();
      rankChange = null; // a rematch is its own ladder match
      // A rematch is a different board; nothing from the old one may fly across.
      renderer.stop();
      shownBoard = state().chess.board.slice();
      lastMove = null;
    }
    wasEnded = !live;
    const wasChecked = inCheck;
    for (const e of events) {
      if (e.type === "toast") showToast(e.text);
      // One `drew` is one card off the deck, whatever the hand size did around
      // it — the rails deal from this rather than from the size change.
      if (e.type === "drew") (e.color === me ? mineRail : theirsRail).drew += 1;
      logEvent(e);
      const sound = eventSound(e);
      if (sound) playSfx(sound);
    }
    // Reset local targeting if the turn/pending situation changed under us.
    if (!myTurn()) { selected = null; freeMoveSource = null; }

    const anims = absorbBoard();
    boardSounds(anims);
    // Check gets its own note, and only on the turn it starts — a king that has
    // been in check for three plies does not need telling three times. The
    // ending's own fanfare covers checkmate, so a finished match stays quiet.
    inCheck = state().status === "playing" && isInCheck(state().chess, state().chess.turn, state().rules);
    if (inCheck && !wasChecked) playSfx("check");
    // Squares a card touched without anything travelling to or from them — an
    // enchant landing, terrain being laid. They have no motion of their own, so
    // the flash is the only thing that says the card did anything there.
    for (const sq of newlyMarked()) {
      if (!anims.some((a) => ("sq" in a && a.sq === sq) || ("to" in a && a.to === sq))) {
        anims.push({ kind: "flash", sq });
      }
    }
    renderer.play(anims);
    render();
    // The result card waits for the board to finish, so a mating move is watched
    // rather than covered halfway through.
    if (!live) pendingAnimMs = animLength(anims);
  });

  session.onNotice((notice) => {
    if (notice === "rematch-waiting") {
      rematchPending = true;
      if (gameOverUp) showGameOver();
    } else if (notice === "opponent-left") {
      opponentLeft = true;
      if (state().status === "ended") showGameOver();
      else showOpponentLeft();
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    handleClick(renderer.squareFromPixel(x, y, flipped));
  });

  clock.onTick(renderClocks);
  clock.onFlag(() => {
    renderClocks();
    // Only the clock's owner may call the flag. Online matches are timed by
    // the server, which will send down the ended state on its own reading.
    if (session.ownsClock && state().status === "playing") session.dispatch({ type: "flag" });
  });

  /**
   * The board's on-screen size is whatever the rest of the column leaves, so
   * it is not known until layout has run — and it changes when the window
   * does. Match the backing store to it, or a big board is a soft board.
   */
  const sizeBoard = (): void => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(360, Math.min(1600, Math.round(rect.width * dpr)));
    // Only repaint when the buffer really changed: the observer fires on every
    // layout pass, and repainting from inside one is how you get a loop.
    if (renderer.resize(px)) render();
  };
  const boardResize = new ResizeObserver(sizeBoard);
  boardResize.observe(canvas);

  sizeBoard();
  render();
  // Sprites may still be decoding on a cold load; repaint once they land.
  void preloadPieces().then(render);

  return () => {
    boardResize.disconnect();
    renderer.stop();
    if (overlayTimer) clearTimeout(overlayTimer);
    if (bannerTimer) clearTimeout(bannerTimer);
    if (toastTimer) clearTimeout(toastTimer);
    if (mineRail.retry) clearTimeout(mineRail.retry);
    if (theirsRail.retry) clearTimeout(theirsRail.retry);
    // The zoom lives on document.body, so leaving the screen has to take it.
    closeCardZoom();
    cutIn.dispose();
    clock.dispose();
    session.dispose();
  };
}
