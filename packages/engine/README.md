# @skill/engine — shared deterministic game engine

The foundation for multiplayer: the "action → state" logic pulled out into a
**pure reducer**. Server and client call **the same `reduce()`**, so the two
views can never diverge.

## Core idea

```
reduce(state: MatchState, action: Action, rng: Rng) → ReduceResult
```

- **`MatchState`** — the whole serializable game state (board + both sides' skill
  runtime + titan + timers + graveyard…). Copied with `structuredClone`; the
  reducer never mutates its input.
- **`Action`** — a serializable intent sent by the client. Multi-step skills
  (Sacrifice, Revive placement, King's Return) send one action per step.
- **`Rng`** — a deterministic random source. **The gambler skills (Evolve /
  Revive) run on the server-owned rng**, so both sides get the same result
  (proven in `reduce.test.ts`).
- **`ReduceResult`** — `{ok:true, state, events}` or `{ok:false, error}`.
  Invalid / illegal actions are rejected (server is authoritative).

## Multiplayer flow

```
[client A] action ──► [server] reduce (authoritative, owns rng) ──► broadcast state/events ──► [clients A·B] render
```

- The server holds a `MatchState` per room, validates and applies each incoming
  action through `reduce`, and sends the result to both sides.
- **Hidden information** (Foresight / Cloak) is handled by sending each client a
  **different view** — the opponent's deck is only a count plus whatever has been
  revealed.

## Porting status — **all 20 skills done** ✅

| Group | Action | Notes |
|-------|--------|-------|
| Normal move | `move` | capture→graveyard, tracks guarded/liberated queens, Undo snapshot |
| Resign | `resign` | |
| Move variants | `retreat` · `cross-diagonal` · `raid-march` · `phantom-move` | king-safety checked; Raid March keeps the turn |
| Buff / meta | `iron-guard` · `one-more` · `cloak` · `foresight` | |
| Teleport | `teleport` | |
| Gambler | `evolve` · `revive` (+`revive-place`) | **injected rng → deterministic** |
| Multi-step | `sacrifice-start/move/end` | steps tracked via `pending` |
| Undo | `undo` | restores `state.undo` + locks the opponent's piece |
| Liberation | `liberation` | tempQueens + 5-turn timer (onTurnStart) |
| Death intercept | (automatic) `loyal-vassal` / `kings-return` (+place) | hooked in `resolveEnding` |
| Titan | `titan-fuse` · `titan-move` | hits detected by `move` landing on a titan cell → `titanHit` |
| Passives | — | Chaos / Agile Knight / Peasant Revolt applied in `deriveRules` |

Covered by 19 tests in `reduce.test.ts` (determinism, immutability, multi-step,
death intercepts, titan destruction).

## Next steps

1. **`packages/server`** — Node + `ws`. Rooms/matchmaking, action validation via
   `reduce`, broadcast, reconnect. The server owns the rng (gambler determinism);
   hidden info (Foresight / Cloak) is filtered per client view.
2. **Card deck system** — the 5-cost skill draft is being reworked into the
   per-game card decks described in `apps/client/src/deck-config.ts`. Effects are
   not wired into `reduce` yet.
