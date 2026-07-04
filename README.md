# Football Trivia Battle

A pixel-art football trivia game. Answer trivia to take and save penalties in a
penalty shootout — 1 v CPU, or 1 v 1 online via Quick Match. Questions come
from a bundled football-only question bank (no network needed).

See [Plans/Initial Plan.md](Plans/Initial%20Plan.md) and
[Plans/Multiplayer Plan.md](Plans/Multiplayer%20Plan.md).

## Stack

- Vite + React + TypeScript (client)
- Node + `ws` (multiplayer WebSocket server, `server/`)

## Scripts

```bash
npm install          # install dependencies
npm run dev          # client dev server (http://localhost:5173)
npm run dev:server   # multiplayer WS server, watch mode (ws://localhost:8787)
npm run start:server # multiplayer WS server, production mode
npm run build        # typecheck + production build -> dist/
npm run typecheck    # type-check only
npm run test         # vitest
npm run lint         # oxlint
```

## Deployment

Hosting splits in two (Vercel can't run a persistent WebSocket process — see
the [hosting model](Plans/Multiplayer%20Plan.md#hosting-model-client-on-vercel)):

### 1. WS server → Render

1. In [Render](https://dashboard.render.com): **New → Blueprint**, pick this
   GitHub repo. [render.yaml](render.yaml) provisions the `football-trivia-ws`
   web service (free plan, `npm run start:server`, health check on `/healthz`).
2. Note the service URL, e.g. `https://football-trivia-ws.onrender.com` —
   the socket URL is the same host with `wss://`.
3. `ALLOWED_ORIGINS` env var: come back and set it after step 2 below.

The free plan sleeps after ~15 min idle, so the first Quick Match after a
quiet spell takes ~30–60 s to wake the server.

### 2. Client → Vercel

1. In [Vercel](https://vercel.com/new): import this GitHub repo. Vite is
   auto-detected (`npm run build`, output `dist/`) — no config file needed.
2. Add env var `VITE_WS_URL = wss://<render-service>.onrender.com`
   (baked in at build time, so set it before the first deploy).
3. Deploy, note the production domain, e.g. `https://<project>.vercel.app`.

### 3. Wire them together

Back in Render, set `ALLOWED_ORIGINS` to the Vercel domain(s),
comma-separated, no trailing slashes:

```
https://<project>.vercel.app
```

The server rejects sockets from any other browser origin. Local dev is
unaffected — `dev:server` defaults to allowing `http://localhost:5173`.

### Server environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8787` | Listen port (Render injects its own) |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins allowed to connect |
