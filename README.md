# Signalibrium

Signalibrium is a private AI trading intelligence workstation prototype built with Next.js 16, React 19, and Tailwind CSS 4. The current app focuses on a compact decision loop:

- curate watchlists
- review ranked setups
- prepare protected trade tickets
- record journal feedback
- inspect risk and backtest surfaces

The product is intentionally prototype-scoped. It persists workspace state locally in development and can use Vercel KV in production, while the live-order connector remains guarded until the broker integration is complete.

## Current Status

The app includes a shared persistence layer backed by [`data/workspace.json`](C:\Users\apexd\OneDrive\Desktop\signalibrium\data\workspace.json) in local development and Upstash Redis in production when configured. That store currently powers:

- watchlist CRUD in `/assets`
- trade ticket CRUD in `/trade-tickets`
- scanner-to-ticket creation in `/scanner`
- journal entry CRUD in `/journal`
- persisted ticket reads in `/risk-lab`
- dashboard summaries sourced from saved workspace data

Mock market, setup, and backtest content still drives the research and display surfaces, while user-managed workspace state is persisted separately.

## Tech Stack

- Next.js `16.2.6`
- React `19.2.4`
- TypeScript `^5`
- Tailwind CSS `^4`
- ESLint `^9`

## App Routes

### Core workflow

- `/` dashboard with watchlist, ticket, journal, risk, and backtest summaries
- `/assets` watchlist management and asset workspace
- `/assets/[symbol]` asset detail view
- `/scanner` ranked setups with one-click ticket preparation
- `/trade-tickets` persisted protected trade tickets
- `/trade-tickets/[ticketId]` ticket detail, notes, and status updates
- `/journal` persisted journal entries with optional linked ticket context

### Supporting labs

- `/risk-lab` risk snapshot derived from the current persisted ticket set
- `/strategy-lab` strategy playbooks and rule summaries
- `/backtesting-lab` backtest result surface

## API Routes

The client-side workspace actions call route handlers under `app/api/`:

- `GET/POST /api/watchlists`
- `GET/PUT/DELETE /api/watchlists/[watchlistId]`
- `GET/POST /api/trade-tickets`
- `GET/PUT/DELETE /api/trade-tickets/[ticketId]`
- `GET/POST /api/journal-entries`
- `GET/PUT/DELETE /api/journal-entries/[entryId]`

These handlers validate input, call repository functions, and persist updates through the shared workspace store.

## Persistence Model

Local development uses a server-side file-backed store. Production should use Upstash Redis from the Vercel Marketplace by setting `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The persisted document contains:

- `workspace`
- `watchlists`
- `tradeTickets`
- `journalEntries`
- `schemaVersion`
- `updatedAt`

This keeps the repository boundary stable while the product shape is still changing. A later move to relational storage can replace storage internals without rewriting the UI surfaces or route contracts.

## Project Structure

```text
app/
  api/
  assets/
  backtesting-lab/
  journal/
  risk-lab/
  scanner/
  strategy-lab/
  trade-tickets/
  _components/
  _data/
  _lib/
    server/
data/
  workspace.json
docs/
  mvp-backend-foundation.md
```

## Getting Started

Install dependencies if needed:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Available Scripts

- `npm run dev` starts the Next.js dev server
- `npm run build` creates a production build
- `npm run start` runs the production server
- `npm run lint` runs ESLint

## Deploying to Vercel

The project is prepared for normal Vercel Git deployments.

- Pushes to `main` create a production deployment automatically.
- Pushes to other branches create preview deployments automatically.
- If you change environment variables in the Vercel dashboard, redeploy once so the running deployment picks them up.

Use the default project settings:

- install: `npm install`
- build: `npm run build`
- output: managed by Next.js

Required production environment variables depend on the market-data rails you
enable. Start with `SIGNALIBRIUM_CHART_VENDOR=embed`; only set IG credentials if
you want the IG fallback enabled in production.

For durable workspace persistence on Vercel, connect Upstash Redis from the
Marketplace and set one of these supported pairs for the `Production` environment:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

or the legacy Vercel KV names:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional:

- `SIGNALIBRIUM_KV_WORKSPACE_KEY=signalibrium:workspace`

Without those Redis/KV variables, a Vercel production runtime will fail loudly
instead of silently storing Siggi state in ephemeral `/tmp` storage.

## Notes

- The repository currently mixes persisted workspace data with mock research data by design.
- `data/workspace.json` is suitable for local prototyping, not multi-user or production use.
- Upstash Redis stores the whole workspace document as one value; split it into normalized tables before high-volume multi-user trading workflows.
- The app is centered on planning, simulation, review, and risk control. It is not an auto-execution system.

## Additional Documentation

- Backend foundation notes: [`docs/mvp-backend-foundation.md`](C:\Users\apexd\OneDrive\Desktop\signalibrium\docs\mvp-backend-foundation.md)
