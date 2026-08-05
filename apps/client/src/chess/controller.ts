import {
  fileOf,
  generateLegalMoves,
  makeSquare,
  onBoard,
  opposite,
  rankOf,
  type Color,
  type PieceType,
  type SkillRules,
  type Square,
} from "@skill/chess-core";
import {
  cardCost,
  isPieceCard,
  modeRules,
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
import { BoardRenderer, preloadPieces, type RenderOptions } from "../render.js";
import { cardToken, icon, type IconName } from "../ui/art.js";
import { skillIcon } from "../skills.js";
import { createLocalSession, type Session } from "./session.js";
import { draftAiDeck } from "./ai-deck.js";
import type { SearchOptions } from "./ai.js";
import { menuScreen } from "../screens/menu.js";
import { deckForMatch } from "../decks.js";
import { cardEl, fitNames } from "../ui/card.js";
import {
  createClock, formatClock, getTimeControlId, isUntimed, timeControlById,
  type Clock, type TimeControl,
} from "../clock.js";
import { cardName, t, tPassthrough } from "../i18n.js";

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
 * The shared game screen. It never mutates game state directly — it renders the
 * session's MatchState and turns clicks into Actions. Works identically for a
 * local AI session and an online (server) session, and for all three modes:
 * the card rail simply does not appear when the mode has no deck.
 */
export function mountGame(
  ctx: AppContext,
  session: Session,
  onExit: () => void,
  control: TimeControl = timeControlById(getTimeControlId()),
): () => void {
  const me = session.myColor;
  const opp = opposite(me);
  const flipped = me === "b";

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
  const statusEl = el("div", { class: "game-status" });
  const overlay = el("div", { class: "game-overlay hidden" });
  const oppStrip = el("div", { class: "opp-strip" });
  const handRail = el("div", { class: "hand-rail" });
  const resourceBar = el("div", { class: "resource-bar" });
  const phaseBar = el("div", { class: "phase-bar" });
  const stepPrompt = el("div", { class: "step-prompt hidden" });
  const sacrificeBar = el("div", { class: "sacrifice-bar hidden" }, [
    el("button", { class: "start-btn", text: t("game.endTurn"), onclick: () => session.dispatch({ type: "free-move-end" }) }),
  ]);
  const toast = el("div", { class: "toast hidden" });
  // Everything that happens, said out loud: cards played, pieces summoned,
  // cards drawn and destroyed. A card game where effects resolve silently is a
  // card game nobody can follow.
  const actionLog = el("div", { class: "action-log" });
  const playFlash = el("div", { class: "play-flash hidden" });
  // Whose turn it is, announced over the board and then gone. A line of text
  // that is always on screen stops being read; a card that appears when the
  // turn changes is read every time.
  const turnBanner = el("div", { class: "turn-banner hidden" });

  // Clocks bracket the board, opponent above and you below, the way a real
  // clock sits between two players.
  const timed = !isUntimed(control);
  const oppClock = el("div", { class: "clock-face" });
  const myClock = el("div", { class: "clock-face" });
  const clockRow = (who: "me" | "opp", face: HTMLElement) =>
    el("div", { class: `clock-row ${who}` }, [
      el("span", { class: "clock-who", text: who === "me" ? t("game.you") : t("game.opponent") }),
      face,
    ]);

  ctx.root.appendChild(
    el("div", { class: "screen chess-screen" }, [
      // The board says which game this is; the top bar only needs the way out.
      el("div", { class: "game-topbar" }, [
        el("button", { class: "back-btn btn-small", text: t("common.leave"), onclick: () => tryLeave() }),
      ]),
      oppStrip,
      timed ? clockRow("opp", oppClock) : null,
      statusEl,
      el("div", { class: "board-wrap" }, [canvas, overlay, playFlash, turnBanner]),
      actionLog,
      timed ? clockRow("me", myClock) : null,
      resourceBar,
      phaseBar,
      stepPrompt,
      sacrificeBar,
      handRail,
      toast,
    ]),
  );

  const clock: Clock = createClock(control);
  const renderer = new BoardRenderer(canvas);

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
      rOpts = { selected: freeMoveSource, targets: quietDests(freeMoveSource), lastMove: null, flipped };
    } else if (pending?.kind === "summon-place") {
      rOpts = { selected: null, targets: [], lastMove: null, flipped, zone: summonZone(s, me) };
    } else if (pending?.kind === "targeting") {
      rOpts = { selected: pickedSquares(pending)[0] ?? null, targets: targetSquares(pending), lastMove: null, flipped };
    } else if (selected !== null) {
      rOpts = { selected, targets: legalTargets(selected), lastMove: null, flipped };
    } else {
      rOpts = { selected: null, targets: [], lastMove: null, flipped };
    }
    rOpts.stuck = stuckSquares();
    rOpts.marks = boardMarks();

    renderer.render(s.chess, rOpts);
    announceTurn();
    sacrificeBar.classList.toggle("hidden", pending?.kind !== "free-moves");
    renderStatus();
    renderResources();
    renderPhases();
    renderStepPrompt();
    renderHand();
    renderOppStrip();

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

  function emptySquares(): Square[] {
    const board = state().chess.board;
    const out: Square[] = [];
    for (let sq = 0; sq < board.length; sq++) if (!board[sq]) out.push(sq);
    return out;
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

  function renderStatus(): void {
    const s = state();
    if (s.status === "ended") return;
    const pending = myStep();
    if (pending) {
      statusEl.textContent =
        pending.kind === "free-moves"
          ? t("play.freeMoves").replace("{n}", String(pending.movesLeft))
        : pending.kind === "targeting" ? targetPrompt(pending)
        : pending.kind === "arrange" ? t("play.arrange")
        : pending.kind === "summon-place" ? t("summon.pick")
        : pending.kind === "discard" ? t("draw.pick")
        : pending.kind === "draw-choice" ? t("draw.title")
        : t("counter.title");
      return;
    }
    if (state().pending) {
      // The opponent owes an answer — most visibly, a counter window.
      statusEl.textContent = state().pending?.kind === "counter"
        ? t("counter.waiting")
        : t("game.oppTurn");
      return;
    }
    if (s.moveSpent && s.phase === "move" && myTurn()) {
      statusEl.textContent = t("play.moveSpent");
      return;
    }
    // Whose turn it is is announced by the banner and, when there are clocks,
    // by which clock is lit. Repeating it here permanently only adds a line of
    // text nobody reads — so the status line goes quiet unless it has something
    // to ask for, or there is no clock to say it instead.
    statusEl.textContent = timed ? "" : myTurn() ? t("game.yourTurn") : t("game.oppTurn");
  }

  /** Cost pips, deck count and discard count — the numbers behind the hand. */
  function renderResources(): void {
    if (!cards()) {
      resourceBar.replaceChildren();
      resourceBar.classList.add("hidden");
      return;
    }
    resourceBar.classList.remove("hidden");
    const s = state();
    const cap = modeRules(s.mode).costCap;
    const mine = s.players[me];
    const theirs = s.players[opp];

    const pips = el("div", { class: "cost-pips" },
      Array.from({ length: cap }, (_, i) =>
        el("i", { class: i < mine.cost ? "on" : "" }),
      ),
    );

    resourceBar.replaceChildren(
      el("div", { class: "res-group" }, [
        el("span", { class: "res-label", text: t("play.cost") }),
        pips,
        el("span", { class: "res-value", text: `${mine.cost}/${cap}` }),
      ]),
      el("div", { class: "res-group" }, [
        el("span", { class: "res-label", text: t("play.deckLeft") }),
        el("span", { class: "res-value", text: String(mine.library.length) }),
      ]),
      el("div", { class: "res-group" }, [
        el("span", { class: "res-label", text: t("play.discard") }),
        el("span", { class: "res-value", text: String(mine.discard.length) }),
      ]),
      el("div", { class: "res-group opp" }, [
        el("span", { class: "res-label", text: t("game.opponent") }),
        el("span", { class: "res-value", text: `◈${theirs.cost} · ✋${theirs.hand.length}` }),
      ]),
    );
  }

  /**
   * The turn's steps, with the current one lit. It doubles as the control for
   * moving on: the "next step" button advances the phase, and once there is
   * nothing left to do it ends the turn.
   */
  function renderPhases(): void {
    const s = state();
    if (!cards() || s.status !== "playing") {
      phaseBar.replaceChildren();
      phaseBar.classList.add("hidden");
      return;
    }
    phaseBar.classList.remove("hidden");
    const steps: { key: MatchState["phase"]; label: string }[] = [
      { key: "draw", label: t("play.phaseDraw") },
      ...(modeRules(s.mode).pieceCards ? [{ key: "summon" as const, label: t("play.phaseSummon") }] : []),
      { key: "skill", label: t("play.phaseSkill") },
      { key: "move", label: t("play.phaseMove") },
    ];
    const mine = myTurn() && !s.pending;

    const chips = steps.map((step) =>
      el("span", {
        class: `phase-chip${mine && s.phase === step.key ? " active" : ""}${
          s.moveSpent && step.key === "move" ? " spent" : ""
        }`,
      }, [
        icon(`phase-${step.key}` as IconName, "phase-icon"),
        el("span", { text: step.label }),
      ]),
    );

    // Passing is only offered while there is a later step to reach; on the move
    // step the same button becomes "end turn", which is what it actually does.
    const nodes: HTMLElement[] = [el("div", { class: "phase-chips" }, chips)];
    if (mine) {
      nodes.push(
        s.phase !== "move"
          ? el("button", { class: "btn btn-ghost btn-small", text: t("play.next"), onclick: () => session.dispatch({ type: "pass-phase" }) })
          : el("button", { class: "btn btn-ghost btn-small", text: t("game.endTurn"), onclick: () => session.dispatch({ type: "end-turn" }) }),
      );
    }
    phaseBar.replaceChildren(...nodes);
  }

  /**
   * The strip for a step that needs an answer off the board: the draw choice, a
   * counter window, and the parts of targeting a board click cannot express —
   * a discard pile to fish in, a promotion to choose, a variable step to close.
   */
  function renderStepPrompt(): void {
    const pending = myStep();
    const kinds = ["draw-choice", "counter", "targeting", "arrange"];
    if (!pending || !kinds.includes(pending.kind)) {
      stepPrompt.replaceChildren();
      stepPrompt.classList.add("hidden");
      return;
    }
    stepPrompt.classList.remove("hidden");

    if (pending.kind === "targeting") return renderTargetPrompt(pending);

    if (pending.kind === "arrange") {
      // 점술: the looked-at cards go back in the order they are clicked, and the
      // last one clicked is the one the next draw takes.
      const order: number[] = [];
      const row = el("div", { class: "step-cards" });
      const paint = () => {
        row.replaceChildren(
          ...pending.cards.map((id, i) => {
            const node = cardEl(id, "sm");
            node.classList.add("hand-card", order.includes(i) ? "blocked" : "playable");
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
      stepPrompt.replaceChildren(
        el("span", { class: "step-title", text: t("play.arrange") }),
        row,
      );
      return;
    }

    if (pending.kind === "draw-choice") {
      stepPrompt.replaceChildren(
        el("span", { class: "step-title", text: t("draw.title") }),
        el("span", {
          class: "step-body",
          text: t("draw.body").replace("{n}", String(state().players[me].hand.length)),
        }),
        el("button", { class: "btn btn-ghost btn-small", text: t("draw.skip"), onclick: () => session.dispatch({ type: "draw-skip" }) }),
        el("button", { class: "btn btn-primary btn-small", text: t("draw.take"), onclick: () => session.dispatch({ type: "draw-take" }) }),
      );
      return;
    }

    // A counter window: say what is being answered, and let them decline.
    if (pending.kind !== "counter") return;
    stepPrompt.replaceChildren(
      icon("counter-horn", "step-icon"),
      el("span", { class: "step-title", text: t("counter.title") }),
      el("span", { class: "step-body", text: t(COUNTER_REASON[pending.trigger] as never) }),
      el("button", { class: "btn btn-ghost btn-small", text: t("counter.pass"), onclick: () => session.dispatch({ type: "counter-pass" }) }),
    );
  }

  /**
   * What a card is waiting for. Squares are picked on the board; everything
   * else — a card in a pile, one of a fixed set of answers — is picked here.
   */
  function renderTargetPrompt(p: Targeting): void {
    const spec = currentSpec(p);
    const nodes: (Node | null)[] = [
      el("span", { class: "step-title", text: cardName(p.card) }),
      el("span", { class: "step-body", text: targetPrompt(p) }),
    ];

    if (spec?.kinds.includes("choice")) {
      for (const option of spec.options ?? []) {
        nodes.push(el("button", {
          class: "btn btn-primary btn-small",
          text: t(`option.${option}` as never),
          onclick: () => pick({ type: "target", option }),
        }));
      }
    }

    if (spec?.kinds.includes("discard")) {
      const pile = state().players[me].discard;
      const row = el("div", { class: "step-cards" },
        pile.map((id, i) => {
          const node = cardEl(id, "sm");
          node.classList.add("hand-card", "playable");
          node.onclick = () => pick({ type: "target", index: i });
          return node;
        }),
      );
      nodes.push(pile.length === 0 ? el("span", { class: "step-body", text: t("play.discardEmpty") }) : row);
    }

    if (spec?.kinds.includes("lasting")) {
      for (const color of [me, opp] as Color[]) {
        for (const l of state().players[color].lasting) {
          nodes.push(el("button", {
            class: "btn btn-ghost btn-small",
            text: `${color === me ? "▲" : "▼"} ${cardName(l.card)}`,
            onclick: () => pick({ type: "target", index: l.id }),
          }));
        }
      }
    }

    // A step that takes a range of picks needs a way to say "that is enough".
    if (spec && spec.max > spec.min) {
      nodes.push(el("button", {
        class: "btn btn-primary btn-small",
        text: t("target.done"),
        onclick: () => pick({ type: "target-done" }),
      }));
    }
    nodes.push(el("button", {
      class: "btn btn-ghost btn-small",
      text: t("common.cancel"),
      onclick: () => pick({ type: "target-cancel" }),
    }));

    stepPrompt.replaceChildren(...nodes.filter((n): n is Node => !!n));
    fitNames(stepPrompt);
  }

  // ── the hand ───────────────────────────────────────────────
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
    if (s.skillsPlayed >= 1) return t("play.oneSkill");
    void index;
    return null;
  }

  function renderHand(): void {
    const s = state();
    if (!cards()) {
      handRail.replaceChildren();
      handRail.classList.add("hidden");
      return;
    }
    handRail.classList.remove("hidden");
    const hand = s.players[me].hand;
    const pending = myStep();
    const discarding = pending?.kind === "discard";

    if (hand.length === 0) {
      handRail.replaceChildren(el("div", { class: "hand-empty", text: t("play.hand") }));
      return;
    }

    handRail.replaceChildren(
      ...hand.map((cardId, i) => {
        const blocked = blockedReason(cardId, i);
        const node = cardEl(cardId, "sm");
        node.classList.add("hand-card");
        node.classList.toggle("playable", !blocked);
        node.classList.toggle("blocked", !!blocked);
        if (discarding) node.classList.add("pitchable");
        if (pending?.kind === "targeting" && pending.card === cardId) node.classList.add("casting");
        if (blocked) node.appendChild(el("span", { class: "card-block", text: blocked }));
        node.onclick = () => onHandClick(cardId, i);
        return node;
      }),
    );
    fitNames(handRail);
  }

  function onHandClick(cardId: string, index: number): void {
    const pending = myStep();
    if (pending?.kind === "targeting") {
      if (currentSpec(pending)?.kinds.includes("own-hand")) pick({ type: "target", index });
      return;
    }
    if (pending?.kind === "discard") {
      return session.dispatch({ type: "discard", index });
    }
    if (pending?.kind === "counter") {
      if (blockedReason(cardId, index)) return;
      return session.dispatch({ type: "counter-play", index });
    }
    if (blockedReason(cardId, index)) return;

    selected = null;
    // Every card is played the same way now; whatever it needs to aim at, the
    // engine asks for next.
    session.dispatch(isPieceCard(cardId) ? { type: "summon", index } : { type: "play-skill", index });
  }

  function renderOppStrip(): void {
    const s = state();
    // Classic has no hand and no lasting cards, so the strip is dead weight.
    oppStrip.classList.toggle("hidden", !cards());
    if (!cards()) { oppStrip.replaceChildren(); return; }
    const hand = s.players[opp].hand;
    const revealed = new Set(s.players[me].revealed);
    const lasting = s.players[opp].lasting;
    const pending = myStep();
    // A card that is asking about the opponent's hand turns these into buttons.
    const pickable =
      pending?.kind === "targeting" && !!currentSpec(pending)?.kinds.includes("opp-hand");

    oppStrip.replaceChildren(
      el("span", { class: "opp-strip-label", text: t("game.oppSkills") }),
      ...hand.map((id, i) => {
        const shown = revealed.has(i) && id !== "hidden";
        const chip = el("div", {
          class: `opp-card${shown ? " revealed" : ""}${pickable ? " peekable" : ""}`,
          text: shown ? cardName(id) : "❓",
        });
        if (pickable) chip.onclick = () => pick({ type: "target", index: i });
        return chip;
      }),
      // 지속 cards the opponent has in play are public — they are changing the
      // rules everyone is playing by.
      ...lasting.map((l) =>
        el("div", { class: "opp-card lasting", text: `${skillIcon(l.card)} ${cardName(l.card)}` }),
      ),
    );
  }

  function scheduleGameOver(): void {
    if (gameOverUp || overlayTimer) return;
    overlayTimer = window.setTimeout(() => { overlayTimer = undefined; showGameOver(); }, GAME_OVER_DELAY_MS);
  }

  function showGameOver(): void {
    const s = state();
    const msg =
      s.winner === "draw" ? t("game.draw")
      : s.winner === me ? t("game.victory")
      : t("game.defeat");
    // Why it ended — checkmate, stalemate, resignation… — so a loss is legible.
    const why = s.endReason ? tPassthrough(s.endReason) : "";
    statusEl.textContent = opponentLeft
      ? `${msg} · ${t("game.oppLeft")}`
      : why ? `${msg} · ${why}` : msg;

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
        el("div", { class: "overlay-msg", text: msg }),
        why ? el("div", { class: "overlay-why", text: why }) : null,
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
    statusEl.textContent = t("game.oppLeft");
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
    const what = !spec ? ""
      : spec.kinds.includes("choice") ? t("target.choice")
      : spec.kinds.includes("empty") && spec.kinds.length === 1 ? t("target.empty")
      : spec.kinds.includes("own-piece") && !spec.kinds.includes("enemy-piece") ? t("target.own")
      : spec.kinds.includes("enemy-piece") && !spec.kinds.includes("own-piece") ? t("target.enemy")
      : spec.kinds.includes("own-hand") ? t("target.ownHand")
      : spec.kinds.includes("opp-hand") ? t("target.oppHand")
      : spec.kinds.includes("discard") ? t("target.discard")
      : spec.kinds.includes("lasting") ? t("target.lasting")
      : t("target.pick");
    return `${cardName(p.card)} — ${what}`;
  }

  const pick = (a: Action): void => session.dispatch(a);

  function handleClick(sq: Square): void {
    const s = state();
    if (s.status === "ended" || opponentLeft) return;

    const pending = myStep();
    if (pending) return handlePending(sq, pending);
    if (s.pending) return; // waiting on the opponent
    if (!myTurn()) return;

    handleNormalClick(sq);
  }

  /** Our own piece that is free to be picked up this turn. */
  function movable(sq: Square): boolean {
    const s = state();
    const p = s.chess.board[sq];
    if (!p || p.color !== me) return false;
    return !stuckSquares().includes(sq);
  }

  function handleNormalClick(sq: Square): void {
    if (state().moveSpent) return; // a card was played instead of the move
    if (selected === null) {
      if (movable(sq)) { selected = sq; render(); }
      return;
    }
    if (sq === selected) { selected = null; return render(); }
    if (movable(sq)) { selected = sq; return render(); }
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
  const LOG_LINES = 4;
  let flashTimer: number | undefined;

  /**
   * Turn one engine event into a line of the feed — and, for a card actually
   * being played, into the card itself sailing across the board. Cards resolve
   * in a single reducer step, so without this the only evidence that something
   * happened is the board quietly changing.
   */
  function logEvent(e: MatchEvent): void {
    const who = (color: Color) => (color === me ? t("game.you") : t("game.opponent"));
    let text: string | null = null;
    let cls = "";

    if (e.type === "played") {
      const summon = isPieceCard(e.card);
      text = t(summon ? "log.summoned" : "log.played")
        .replace("{who}", who(e.color))
        .replace("{card}", cardName(e.card));
      cls = summon ? "summon" : "play";
      if (!summon || e.color === me) flashCard(e.card, e.color);
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
    }, 1200);
  }

  /** The played card, big, over the board for a moment. */
  function flashCard(cardId: string, color: Color): void {
    playFlash.replaceChildren(
      el("div", { class: `flash-card ${color === me ? "mine" : "theirs"}` }, [
        cardEl(cardId, "md"),
        el("span", { class: "flash-who", text: color === me ? t("game.you") : t("game.opponent") }),
      ]),
    );
    fitNames(playFlash);
    playFlash.classList.remove("hidden");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      playFlash.classList.add("hidden");
      playFlash.replaceChildren();
    }, 1400);
  }

  // ── wire up ────────────────────────────────────────────────
  let toastTimer: number | undefined;
  function showToast(text: string): void {
    toast.textContent = tPassthrough(text);
    toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 1600);
  }

  session.subscribe((_s, events) => {
    for (const e of events) {
      if (e.type === "toast") showToast(e.text);
      logEvent(e);
    }
    // Reset local targeting if the turn/pending situation changed under us.
    if (!myTurn()) { selected = null; freeMoveSource = null; }
    render();
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

  render();
  // Sprites may still be decoding on a cold load; repaint once they land.
  void preloadPieces().then(render);

  return () => {
    if (overlayTimer) clearTimeout(overlayTimer);
    clock.dispose();
    session.dispose();
  };
}
