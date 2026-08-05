import {
  SKILLS,
  createMatch,
  deriveRules,
  isPieceCard,
  pieceCardType,
  reduce,
  skillKind,
  summonZone,
  type Action,
  type MatchState,
} from "@skill/engine";
import { parseFen, type Square } from "@skill/chess-core";
import { el } from "../router.js";
import { BoardRenderer, preloadPieces } from "../render.js";
import { cardToken } from "./art.js";
import { cardEl, fitNames } from "./card.js";
import { skillIcon } from "../skills.js";
import { cardDesc, cardName, t } from "../i18n.js";

/**
 * "Take a closer look": the card, played for real.
 *
 * Rules text tells you what a card does; this shows it happening. The preview
 * runs an actual match in memory — the same reducer the game runs on — plays
 * the card with sensible targets, and paints the board before and after. If the
 * engine's behaviour ever drifts from the rules text, this is where it shows.
 */

/** A position with room for everything: kings guarded, lines open, sides touching. */
const SANDBOX = "r2qk2r/ppp1nppp/8/3pP3/3Pp3/8/PPP1NPPP/R2QK2R w KQkq - 0 1";

/** Positions for cards the sandbox cannot demonstrate on its own. */
const STAGE: Record<string, string> = {
  "kings-strike": "r3k2r/ppp2ppp/8/8/8/8/PPPn1PPP/R2QK2R w KQkq - 0 1",
  regicide: "r2qk2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
  citadel: "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
};

/** Give the demo something to act on, for cards that need a prop. */
function dress(m: MatchState, id: string): void {
  const spare = ["meditate", "thrift", "beacon"];
  if (id === "herald" || id === "recall") m.players.w.discard = [...spare];
  if (["scout", "coerce", "exchange", "shatter", "clairvoyance"].includes(id)) {
    m.players.b.hand = [...spare];
  }
  if (id === "shatter" || id === "typhoon") {
    m.players.b.lasting = [{ id: 901, card: "beacon", owner: "b" }];
  }
  if (id === "cleanse" || id === "purifying-light") {
    m.enchants = [{
      id: 1, card: "large-sandbag", owner: "b",
      on: { kind: "piece", sq: sqOf("e2") }, turnsLeft: 5, ticksOn: "b",
    }];
  }
  if (id === "unbind") {
    m.enchants = [{
      id: 1, card: "large-sandbag", owner: "w",
      on: { kind: "piece", sq: sqOf("e7") }, turnsLeft: 5, ticksOn: "w",
    }];
  }
  if (id === "rewind") {
    m.undo = {
      mover: "b",
      chess: parseFen("r2qk2r/ppp1nppp/8/3p4/3Pp3/8/PPP1NPPP/R2QK2R b KQkq - 0 1"),
      captured: null,
      from: sqOf("e7"),
      to: sqOf("e5"),
    };
  }
  if (id === "disguise" || id === "offering" || id === "exchange") {
    m.players.w.hand.push("thrift", "beacon");
  }
}

function sqOf(alg: string): Square {
  const file = alg.charCodeAt(0) - 97;
  const rank = Number(alg[1]) - 1;
  return rank * 8 + file;
}

function staged(cardId: string): MatchState {
  const m = createMatch("skill", [], []);
  m.chess = parseFen(STAGE[cardId] ?? SANDBOX);
  m.players.w.hand = [cardId];
  m.players.w.cost = 10;
  m.players.b.cost = 10;
  m.players.w.library = ["thrift", "beacon", "sanctuary", "plague", "espionage"];
  m.players.b.library = ["thrift", "beacon"];
  m.pending = null;
  m.phase = isPieceCard(cardId) ? "summon" : "skill";
  dress(m, cardId);
  m.rules = deriveRules(m);
  return m;
}

/** Everything the current target step could be answered with. */
function candidates(s: MatchState): Action[] {
  const p = s.pending;
  if (p?.kind !== "targeting") return [];
  const spec = SKILLS.find((x) => x.id === p.card)?.targets?.[p.step];
  if (!spec) return [];
  const out: Action[] = [];
  for (const kind of spec.kinds) {
    if (kind === "own-piece" || kind === "enemy-piece" || kind === "empty") {
      for (let i = 0; i < s.chess.board.length; i++) out.push({ type: "target", sq: i });
    } else if (kind === "own-hand") {
      s.players[p.color].hand.forEach((_, i) => out.push({ type: "target", index: i }));
    } else if (kind === "opp-hand") {
      s.players[p.color === "w" ? "b" : "w"].hand.forEach((_, i) => out.push({ type: "target", index: i }));
    } else if (kind === "discard") {
      s.players[p.color].discard.forEach((_, i) => out.push({ type: "target", index: i }));
    } else if (kind === "lasting") {
      for (const c of ["w", "b"] as const) {
        for (const l of s.players[c].lasting) out.push({ type: "target", index: l.id });
      }
    } else if (kind === "choice") {
      for (const option of spec.options ?? []) out.push({ type: "target", option });
    }
  }
  return out;
}

/** Answer the outstanding steps, backing out of picks that lead nowhere. */
function resolveTargets(s: MatchState, depth = 0): MatchState | null {
  if (s.pending?.kind !== "targeting") return s;
  if (depth > 6) return null;
  for (const action of candidates(s)) {
    const r = reduce(s, action);
    if (!r.ok) continue;
    const done = resolveTargets(r.state, depth + 1);
    if (done) return done;
  }
  const closed = reduce(s, { type: "target-done" });
  return closed.ok ? resolveTargets(closed.state, depth + 1) : null;
}

interface Demo {
  before: MatchState;
  after: MatchState;
  changed: Square[];
}

/** Play the card in a sandbox and hand back both sides of the moment. */
function runDemo(cardId: string): Demo | null {
  const before = staged(cardId);
  const opening: Action = isPieceCard(cardId)
    ? { type: "summon", index: 0 }
    : { type: "play-skill", index: 0 };
  const played = reduce(before, opening);
  if (!played.ok) return null;

  let after: MatchState | null = played.state;
  if (after.pending?.kind === "summon-place") {
    const zone = summonZone(after, "w");
    const drop = reduce(after, { type: "summon-place", sq: zone[Math.floor(zone.length / 2)] ?? zone[0]! });
    after = drop.ok ? drop.state : null;
  } else {
    after = resolveTargets(after);
  }
  if (!after) return null;

  const changed: Square[] = [];
  for (let sq = 0; sq < before.chess.board.length; sq++) {
    const a = before.chess.board[sq];
    const b = after.chess.board[sq];
    if ((a?.type ?? null) !== (b?.type ?? null) || (a?.color ?? null) !== (b?.color ?? null)) {
      changed.push(sq);
    }
  }
  // Enchants and terrain do not move a piece; ring what they landed on instead.
  for (const e of after.enchants) {
    if (e.on.kind !== "player" && !before.enchants.some((x) => x.id === e.id)) changed.push(e.on.sq);
  }
  for (const l of after.players.w.lasting) {
    if (l.sq !== undefined && !before.players.w.lasting.some((x) => x.id === l.id)) changed.push(l.sq);
  }
  return { before, after, changed };
}

/** One board, painted once. */
function boardPane(state: MatchState, label: string, changed: Square[]): HTMLElement {
  const canvas = el("canvas", { class: "preview-board" }) as HTMLCanvasElement;
  canvas.width = 384;
  canvas.height = 384;
  const pane = el("div", { class: "preview-pane" }, [
    el("span", { class: "preview-label", text: label }),
    canvas,
  ]);
  // The deck builder never draws a board, so the sprites may still be loading;
  // painting before they land would show a board of unicode glyphs.
  void preloadPieces().then(() => {
    const renderer = new BoardRenderer(canvas);
    renderer.setDims(state.chess);
    renderer.render(state.chess, {
      selected: null,
      targets: [],
      lastMove: null,
      flipped: false,
      changed,
      // An enchant does not move a piece, so without its badge the "after"
      // board would look identical to the "before" one.
      marks: [
        ...state.enchants.flatMap((e) =>
          e.on.kind === "player" ? [] : [{
            sq: e.on.sq,
            glyph: skillIcon(e.card),
            token: cardToken(e.card),
            tone: e.owner === "w" ? ("good" as const) : ("bad" as const),
          }],
        ),
        ...state.players.w.lasting.flatMap((l) =>
          l.sq === undefined ? [] : [{
            sq: l.sq,
            glyph: skillIcon(l.card),
            token: cardToken(l.card),
            tone: "good" as const,
          }],
        ),
      ],
    });
  });
  return pane;
}

/** The counters a card can move that the board cannot show. */
function statLine(s: MatchState): string {
  const p = s.players.w;
  return [
    `${t("play.cost")} ${p.cost + p.bonusCost}`,
    `${t("play.hand")} ${p.hand.length}`,
    `${t("play.deckLeft")} ${p.library.length}`,
    `${t("play.discard")} ${p.discard.length}`,
  ].join(" · ");
}

/**
 * Open the preview over whatever screen is showing. It is a plain overlay, so
 * it closes on Escape, on the backdrop, and on its own button.
 */
export function openCardPreview(ctx: { root: HTMLElement }, cardId: string): void {
  const demo = runDemo(cardId);
  const kind = skillKind(cardId);

  const close = () => {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };

  const boards = demo
    ? el("div", { class: "preview-boards" }, [
        boardPane(demo.before, t("preview.before"), []),
        el("span", { class: "preview-arrow", text: "→" }),
        boardPane(demo.after, t("preview.after"), demo.changed),
      ])
    : el("div", { class: "preview-empty", text: t("preview.none") });

  const summonNote = isPieceCard(cardId) && pieceCardType(cardId)
    ? el("div", { class: "preview-note", text: t("summon.zone") })
    : null;

  const overlay = el("div", { class: "preview-overlay", onclick: (e: MouseEvent) => {
    if (e.target === overlay) close();
  } }, [
    el("div", { class: "glass preview-card" }, [
      el("div", { class: "preview-head" }, [
        cardEl(cardId, "md"),
        el("div", { class: "preview-head-text" }, [
          el("h2", { class: "preview-name", text: cardName(cardId) }),
          kind ? el("span", { class: "preview-kind", text: `${t(`kind.${kind}` as never)} · ${t(`kind.${kind}Note` as never)}` }) : null,
          el("p", { class: "preview-desc", text: cardDesc(cardId) }),
        ]),
      ]),
      boards,
      demo
        ? el("div", { class: "preview-stats" }, [
            el("span", { text: `${t("preview.before")}: ${statLine(demo.before)}` }),
            el("span", { text: `${t("preview.after")}: ${statLine(demo.after)}` }),
          ])
        : null,
      summonNote,
      el("button", { class: "btn btn-primary", text: t("common.ok"), onclick: () => close() }),
    ]),
  ]);

  ctx.root.appendChild(overlay);
  fitNames(overlay);
  window.addEventListener("keydown", onKey);
}
