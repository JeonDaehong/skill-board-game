import { other, type GameModule, type Player } from "@skill/games";

/** Out-of-band events a remote (server) board session can emit. */
export type BoardNotice = "rematch-waiting" | "opponent-left";

/** A client's handle on a board-game match — local (vs AI) or remote (server).
 *  Mirrors the chess Session, but generic over any @skill/games module. */
export interface BoardSession<S, M> {
  readonly myPlayer: Player;
  getState(): S;
  subscribe(cb: (s: S) => void): void;
  onNotice(cb: (n: BoardNotice) => void): void;
  dispatch(move: M): void;
  rematch(): void;
  dispose(): void;
}

/** Single-player: runs the pure module in-process; `aiMove` drives the AI. */
export function createLocalBoardSession<S, M>(
  mod: GameModule<S, M>,
  aiMove: (s: S) => M | null,
  human: Player,
): BoardSession<S, M> {
  const ai = other(human);
  let state = mod.createState();
  let listener: ((s: S) => void) | null = null;
  let disposed = false;
  let timer: number | undefined;

  const notify = () => listener?.(state);

  function scheduleAi(): void {
    if (disposed || mod.result(state).done || mod.turn(state) !== ai) return;
    timer = window.setTimeout(() => {
      if (disposed || mod.turn(state) !== ai || mod.result(state).done) return;
      const m = aiMove(state);
      if (m && mod.isLegal(state, m)) {
        state = mod.apply(state, m);
        notify();
        scheduleAi();
      }
    }, 380);
  }

  scheduleAi(); // AI opens if the human plays second ("w")

  return {
    myPlayer: human,
    getState: () => state,
    subscribe: (cb) => { listener = cb; },
    onNotice: () => {},
    dispatch: (m) => {
      if (mod.result(state).done || mod.turn(state) !== human || !mod.isLegal(state, m)) return;
      state = mod.apply(state, m);
      notify();
      scheduleAi();
    },
    rematch: () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      state = mod.createState();
      notify();
      scheduleAi();
    },
    dispose: () => { disposed = true; if (timer) clearTimeout(timer); },
  };
}

/** Online: dispatch sends to the server; state arrives back over the socket. */
export function createRemoteBoardSession<S, M>(
  ws: WebSocket,
  myPlayer: Player,
  initial: S,
): BoardSession<S, M> {
  let state = initial;
  let listener: ((s: S) => void) | null = null;
  let noticer: ((n: BoardNotice) => void) | null = null;

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.type === "state") { state = msg.state as S; listener?.(state); }
    else if (msg.type === "rematch-waiting") noticer?.("rematch-waiting");
    else if (msg.type === "opponent-left") noticer?.("opponent-left");
  };

  return {
    myPlayer,
    getState: () => state,
    subscribe: (cb) => { listener = cb; },
    onNotice: (cb) => { noticer = cb; },
    dispatch: (m) => ws.send(JSON.stringify({ type: "action", action: m })),
    rematch: () => ws.send(JSON.stringify({ type: "rematch" })),
    dispose: () => ws.close(),
  };
}
