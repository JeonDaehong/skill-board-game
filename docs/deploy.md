# Putting it online

Short answer to "do I need an EC2?": you need **one machine that stays on and
has a public address**. EC2 is one way; a $5 Lightsail box, Fly.io, Railway or
Render are the same thing with less setup. What you cannot use is anything
serverless (Lambda, Vercel functions, Cloudflare Workers) — a match is a
WebSocket held open for the length of the game, and those platforms bill and
kill by the request.

Running `pnpm dev` + `pnpm server` on your laptop only ever reaches your
laptop. Two browser tabs on the same machine can play each other; nobody else
can, because `localhost` means *their* machine to them.

## The shape

One Node process serves everything: the page, the account API and the match
socket, all on one port.

```
                    ┌──────────────────────────────┐
  players  ──443──▶ │ Caddy (TLS, your domain)     │
                    │        │ reverse proxy       │
                    │        ▼                     │
                    │ node packages/server  :8787  │
                    │   /api/*   accounts + saves  │
                    │   upgrade  match socket      │
                    │   else     apps/client/dist  │
                    │        │                     │
                    │        ▼  data/skill.db      │
                    └──────────────────────────────┘
```

Keeping the client on the same origin as the server is what makes this easy:
no CORS, no second host, no `https` page trying to open a `ws://` socket, one
certificate.

## Try it without a server first

To let a friend in for an evening, tunnel your laptop instead of deploying:

```sh
pnpm --filter @skill/client build
CLIENT_DIR=apps/client/dist node --import tsx packages/server/src/index.ts
cloudflared tunnel --url http://localhost:8787     # or: ngrok http 8787
```

Give out the URL it prints. It is https, so the socket is wss, and everything
works. This is worth doing before paying for anything — it is the same code
path the real deploy takes.

## The real thing (Ubuntu box, EC2 or otherwise)

Anything with 1 GB of RAM is plenty; the server holds a few maps and a SQLite
file. `t4g.small` or a $5 VPS.

**1. Security group / firewall**: allow 22, 80, 443 in. Not 8787 — the proxy
is the only thing that should reach it.

**2. Install and build**

```sh
# Ubuntu's own `nodejs` package is years behind; better-sqlite3 needs 20+.
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs caddy build-essential python3
sudo corepack enable && corepack prepare pnpm@10.33.0 --activate
git clone <your repo> skill && cd skill
pnpm install
pnpm --filter @skill/client build     # → apps/client/dist
```

`better-sqlite3` compiles here if there is no prebuilt binary for this
platform, which is why `build-essential` and `python3` are on that line.

**On a 1 GB box (t2.micro / t3.micro), the client build is the step that will
kill you** — `tsc` + vite need more memory than that leaves. Either add swap
once:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

…or don't build there at all: build on your own machine and copy the result up,
which is faster anyway.

```sh
pnpm --filter @skill/client build
rsync -az apps/client/dist/ ubuntu@<host>:/home/ubuntu/skill/apps/client/dist/
```

**3. Run it as a service** — `/etc/systemd/system/skill.service`:

```ini
[Unit]
Description=skill board game
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/skill/packages/server
Environment=PORT=8787
Environment=CLIENT_DIR=/home/ubuntu/skill/apps/client/dist
Environment=SKILL_DB=/var/lib/skill/skill.db
Environment=TRUST_PROXY=1
ExecStart=/home/ubuntu/skill/packages/server/node_modules/.bin/tsx src/index.ts
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

```sh
sudo mkdir -p /var/lib/skill && sudo chown ubuntu /var/lib/skill
sudo systemctl enable --now skill
```

`TRUST_PROXY=1` matters: without it every request looks like it comes from the
proxy, and the login rate limit becomes one shared bucket for all players.

**4. TLS** — `/etc/caddy/Caddyfile`:

```
play.example.com {
    reverse_proxy localhost:8787
}
```

`sudo systemctl reload caddy`. Caddy gets the certificate itself and proxies
the WebSocket upgrade without extra configuration.

**You need a real domain for this.** Let's Encrypt will not issue a
certificate for an EC2 default hostname (`*.compute.amazonaws.com`), so there
is no TLS without one. Three ways out, in the order they cost you anything:

- **Cloudflare Tunnel** on the box (`cloudflared`) — no domain, no open ports,
  no security group changes, and it terminates TLS for you. Best first move.
  Cloudflare reclaims idle WebSockets, which would matter here: the clock is
  server-side and only ships with `state`, so a player thinking for two minutes
  sends nothing at all. The server's 30s heartbeat is what makes this safe —
  see `HEARTBEAT_MS` in `packages/server/src/index.ts`.
- **A domain** (~$10/yr) pointed at an Elastic IP, then the Caddyfile above.
- **Plain http on the public IP** — works, and `ws://` from an `http://` page
  is allowed, so the game plays. But the login form posts a password in the
  clear and every browser labels the page Not secure. Fine for an evening with
  friends; not fine for anything you tell strangers about.

Also give the instance an **Elastic IP** if you go the DNS route: a stopped and
restarted EC2 gets a new public address, and the old one is in your friends'
address bars.

## Deploying the client somewhere else

If you would rather host the bundle on Cloudflare Pages or Netlify, build it
with the server's address baked in:

```sh
VITE_SERVER_URL=https://play.example.com pnpm --filter @skill/client build
```

`ALLOWED_ORIGIN=https://your-pages-site` on the server then pins CORS to it.
Both halves have to be https or the socket will not open.

## Updating

```sh
git pull && pnpm install && pnpm --filter @skill/client build
sudo systemctl restart skill
```

Players are disconnected — anyone mid-match loses the room. There is no
reconnect yet, so deploy when nobody is playing.

## The database

One file: `SKILL_DB`, default `packages/server/data/skill.db`. It holds every
account and every player's progress and it is the only thing on the box that
cannot be rebuilt from the repo.

```sh
# WAL mode, so do not just cp it while the server is running
sqlite3 /var/lib/skill/skill.db ".backup /home/ubuntu/backup-$(date +%F).db"
```

Put that on a cron and copy the result off the machine.

## What is not done yet

- **No password reset.** There is no email address on an account to send one
  to. A player who forgets their password needs a new account, or you go into
  the database. Worth fixing before this is public.
- **No reconnect.** A dropped socket ends the match for both players. The
  heartbeat means a connection that dies quietly — slept laptop, a phone off
  the network — is reaped within about a minute and the opponent is told
  instead of waiting on a ghost. But noticing is all it does: there is no way
  back into a match once the socket is gone, so a two-second blip on the train
  costs the game.
- **Saves are opaque to the server.** It stores the client's progress blob
  without reading it, so a modified client can award itself coins and cards.
  Fine while the economy is single-player; if cards ever become tradeable,
  coins and collection have to move into columns the server owns and rules on.
  See the note at the top of `apps/client/src/save.ts`.
- **Rate limiting is per-process and in memory.** Restarting the server clears
  it, and a second instance would not share it.
