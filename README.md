# Skill Board Game

A board game platform with a skill/card layer on top. Classic rules first, then
skills → multiplayer → Steam (PC) / Google Play (mobile). Written entirely in
code — no GUI editor.

Three games ship right now: **Chess**, **Janggi**, and **Gomoku**.

## Stack

- **TypeScript** only — no GUI editor
- **Rendering**: HTML Canvas (unicode glyphs, no image assets)
- **Build / dev**: Vite
- **Tests**: Vitest
- **Packages**: pnpm workspace (monorepo)
- **Multiplayer**: Node + WebSocket (`packages/server`)
- **Accounts**: same server, HTTP/JSON + SQLite (`better-sqlite3`)

Later: Steam via Tauri/Electron wrapping, mobile via Capacitor.

## Layout

```
skill-board-game/
├── packages/
│   ├── chess-core/   pure chess rules engine (no DOM, fully tested)
│   ├── engine/       deterministic match reducer — shared by client and server
│   ├── games/        the other board games (janggi, omok, othello, quoridor)
│   └── server/       Node: rooms + matchmaking over ws, accounts over HTTP
│       └── src/
│           ├── index.ts   one port: API, match socket, and the built client
│           ├── api.ts      /api/signup /login /me /save /nickname
│           ├── auth.ts     scrypt hashing, session tokens, rate limiting
│           └── db.ts       SQLite: accounts, sessions, saves
└── apps/
    └── client/       Vite app — screen router, plain DOM/Canvas, no framework
        └── src/
            ├── main.ts         bootstrap (router → sign in / main menu)
            ├── account.ts      sign in / up, session, progress sync
            ├── save.ts         the progress blob the server stores
            ├── config.ts       where the server is (VITE_SERVER_URL)
            ├── router.ts       screen router + DOM helpers
            ├── games.ts        the game list shown in the picker
            ├── deck-config.ts  per-game deck / hand / clock rules
            ├── skills.ts       skill card definitions
            ├── net.ts          matchmaking socket + handoff to the game view
            ├── render.ts       canvas board/piece renderer
            ├── screens/        menu, picker, deck builder, rooms, profile, shop
            ├── chess/          chess screen + AI (negamax + alpha-beta)
            └── board/          shared board-game screen + per-game views
```

**Core design rule**: rules logic (`chess-core`, `games`, `engine`) is fully
separated from rendering and networking. The same engine runs on the client, the
server, and mobile; rules are verified by unit tests without a GUI; the skill
layer extends the logic only.

## Running

```bash
pnpm install
pnpm dev              # client dev server (http://localhost:5280)
pnpm server           # game + account server (http://localhost:8787)
pnpm test             # all tests
pnpm build            # build everything
```

The client asks you to sign in before anything else, so run the server too —
or use the "Play offline" door the login screen offers once it fails to reach
one. To let other people play, see [docs/deploy.md](docs/deploy.md).

## Status

- [x] Full chess rules (moves, castling, en passant, promotion)
- [x] Check / checkmate / stalemate / draws (50-move, insufficient material)
- [x] perft verified (start depth 4 = 197,281; Kiwipete depth 3 = 97,862)
- [x] Canvas rendering, click-to-move, legal-move highlights, board flip
- [x] Main menu, game picker carousel, 3·2·1 countdown
- [x] AI opponent (negamax + alpha-beta, material + position eval)
- [x] Janggi and Gomoku with their own AI
- [x] Online play: quick match, create/join rooms, invite codes, rematch
- [x] Accounts: sign up / sign in, progress synced across devices
- [ ] Password reset (no email on an account yet)
- [x] Deterministic match reducer (`@skill/engine`) shared by client and server
- [ ] Card deck system — deck builder saves selections; card effects not wired up
- [ ] Steam (PC) packaging (Tauri/Electron)
- [ ] Mobile (Google Play) packaging (Capacitor)
