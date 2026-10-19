# Ts-Tree

A small tournament manager built with Vue 3, Node.js and SQLite. Anyone can sign up with an email address and password and then run their own knockout tournament with 4 to 16 players. The UI is available in German (default) and English. Frontend and API run together in one Docker container; the database lives in a persistent Docker volume.

Live at **https://tuerker-cakici.de/ts-tree/**.

## Running with Docker

Requirement: Docker with Docker Compose.

```bash
docker compose up -d --build
```

Then open **http://localhost:8080**. From another device, use the Docker host's IP address instead of `localhost`.

On first visit, create an account with **Sign up**.

## Usage

1. Sign up or sign in, then choose 4 to 16 players in the dropdown. The bracket adapts immediately.
2. Enter the names directly in the first-round fields and click **Start tournament**.
3. After a match, click the arrow next to the winner. They move on to the next round automatically. Green markers and connector lines show winners, red ones show eliminated players.
4. Pick the winner of the final. The tournament champion appears above the bracket.
5. Use **New game** and confirm to delete the current tournament with all players and results and set up a new one.

For player counts without a full bracket (5–7 and 9–15), byes are assigned automatically. Positions follow a standard seeding order; the number next to a name is its seed. Byes do not count as matches played.

A result can be corrected by picking the other player, or removed with the reset icon on the match. Only the later rounds that depend on it are reset. Duplicate names are allowed because players have internal IDs. On narrow screens the bracket scrolls horizontally.

## Language

A **DE / EN** switch is available on the sign-in page, in the header of the tournament manager and on the shared public view. German is the default; the choice is remembered in the browser (`localStorage`). The client sends the selected language in the `X-Lang` header, so server error messages and the password reset email arrive in the same language.

## Accounts and password reset

An account consists of an email address and a password (at least 8 characters). Every account has its own tournament.

**Forgot password?** sends a reset link by email through [Resend](https://resend.com). The link is valid for one hour and works only once; only a hash of it is stored. The response is always the same, so it cannot be used to find out which addresses are registered. At most one email per account per minute is sent. Completing a reset ends all existing sessions of that account. Without `RESEND_API_KEY` the link is written to the server log instead.

## Sharing a tournament

Every started tournament gets a random six-digit code, for example `042718`. The code and a clickable link are shown in the tournament manager. Anyone with the link can view the bracket at **`/tree/042718`** without signing in. The public view shows names, results and the champion, has no editing controls and refreshes every five seconds. It stays read-only even when you are signed in.

Codes are stored permanently as issued in SQLite and are never reused within that database, even after the tournament is deleted. A deleted tournament's code no longer returns a tournament; new tournaments get a new code. The data volume also holds the issued codes and must be kept for them to stay reserved.

## Configuration

Optionally, before starting:

```bash
cp .env.example .env
```

Adjust the values in `.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port on the Docker host |
| `COOKIE_SECURE` | `false` | Set to `true` when served over HTTPS |
| `COOKIE_PATH` | `/` | Path of the session cookie, e.g. `/ts-tree` when served under a sub-path |
| `APP_URL` | `http://localhost:3000` | Public address of the app, used for the link in the reset email |
| `RESEND_API_KEY` | – | Resend API key; without it the reset link is only logged |
| `MAIL_FROM` | `noreply@tuerker-cakici.de` | Sender address, must be verified with Resend |
| `BIND_ADDR` | `0.0.0.0` | Address the Node server binds to (direct Node operation only) |

Apply changes with `docker compose up -d`. For a public deployment, use HTTPS through a reverse proxy, which must pass on the original `Host` header.

Sessions expire after twelve hours and use an HttpOnly cookie with SameSite=Strict. Ten failed sign-ins per IP within 15 minutes temporarily block further attempts; sign-ups and reset requests are rate-limited per IP as well. Behind a reverse proxy, the proxy's IP counts. Passwords are stored with scrypt and a per-user salt. Tournament changes are validated on the server; stale changes from a second browser tab are rejected and the current state is loaded.

## Operations and data

```bash
docker compose logs -f
docker compose down
docker compose up -d
```

A plain `down` keeps the data. `docker compose down -v` removes the data volume and with it all stored data.

SQLite stores accounts, tournaments and sessions in `/app/data/tournament.sqlite`. The named volume in the Compose file is `tournament-data`. The container runs as user `node`. The health check calls `/api/health`.

For a consistent backup, stop the container briefly and copy the whole data directory:

```bash
docker compose stop
mkdir -p backup
docker compose cp padel-turnier:/app/data/. ./backup/
docker compose start
```

## Local development

Use Node.js 22.12 or later (Node.js 24 recommended) and npm.

```bash
npm ci
```

Start in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev
```

Open the address printed by Vite (usually `http://localhost:5173`). API requests are proxied to Node.js on port 3000. Locally the database is created in `data/`. The `.env` file is read by Docker Compose; when running Node directly, set options as environment variables. `DATA_DIR` changes the data directory.

Production build without Docker:

```bash
npm run build
npm start
```

Then open `http://localhost:3000`.

## Deployment

Runs on the VPS at **https://tuerker-cakici.de/ts-tree/** as a systemd service behind nginx. To serve under a sub-path, build with `APP_BASE=/ts-tree/ npm run build`. See [`deploy/README.md`](deploy/README.md).

## Checks

```bash
npm test
npm run build
docker compose config --quiet
```

The 29 automated tests cover all player counts, byes, complete tournament runs, result changes, sign-up, sign-in, separate tournaments per account, password reset by email, language-dependent messages, access control, input validation, concurrent changes, delete/recreate and SQLite persistence across restarts. They also check public read access, blocked writes, permanently reserved codes and the rendered view without editing buttons. API tests push real request streams through the HTTP handler without opening a network port.

## Structure

- `src/`: Vue UI, translations (`i18n.js`) and SVG connectors in the bracket.
- `shared/tournament.js`: tournament logic shared by preview and server.
- `server/index.js`: Node HTTP server, accounts, password reset via Resend and SQLite.
- `server/i18n.js`: English translations of server messages and the reset email.
- `tests/`: logic and API tests.
- `Dockerfile` and `compose.yaml`: build, runtime and persistent storage.

The Vue UI is built with Vite ([Vue documentation](https://vuejs.org/guide/quick-start.html)). The backend uses the built-in [`node:sqlite`](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) and needs no extra npm packages in the production container.
