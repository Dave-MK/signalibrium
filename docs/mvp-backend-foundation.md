# MVP Backend Foundation

## Status

The backend foundation is now on its second meaningful milestone.

The app has a shared server-side persistence layer that:

- stores workspace data in a local JSON file
- exposes route handlers for watchlists, trade tickets, journal entries, assets, scanner results, backtests, and market snapshot
- exposes route handlers for market events, confirmation checks, and AI opportunities
- keeps repository boundaries clean enough to swap in a real database later
- powers live product flows across the dashboard, shell, assets, asset detail, scanner, trade tickets, journal, risk lab, and backtesting lab

## What Is Implemented

### File-backed workspace store

The app uses a server-side file-backed store at [`data/workspace.json`](C:\Users\apexd\OneDrive\Desktop\signalibrium\data\workspace.json).

Why this is still the right step for MVP:

- it works inside the current repo with no external infrastructure
- it provides real persistence immediately
- it lets the app stabilize entity shapes and repository contracts before introducing a database
- it is now migration-aware, so earlier workspace files normalize forward into the newer schema safely

### Repository layer

The persistence layer is organized around server repositories:

- `watchlists`
- `trade-tickets`
- `journal-entries`
- `assets`
- `scanner-results`
- `backtests`
- `market-snapshot`
- `market-events`
- `confirmation-checks`
- `ai-opportunities`

Those repositories are used by route handlers and server-rendered pages instead of letting UI code talk to the file store directly.

### API surface

Implemented route handlers:

- `GET/POST /api/watchlists`
- `GET/PUT/DELETE /api/watchlists/[watchlistId]`
- `GET/POST /api/trade-tickets`
- `GET/PUT/DELETE /api/trade-tickets/[ticketId]`
- `GET/POST /api/journal-entries`
- `GET/PUT/DELETE /api/journal-entries/[entryId]`
- `GET/POST /api/assets`
- `GET/PUT /api/assets/[symbol]`
- `GET/POST /api/scanner-results`
- `GET/PUT/DELETE /api/scanner-results/[resultId]`
- `GET/POST /api/backtests`
- `GET/PUT/DELETE /api/backtests/[backtestId]`
- `GET/PUT /api/market-snapshot`
- `GET/POST /api/market-events`
- `GET/POST /api/confirmation-checks`
- `GET/POST /api/ai-opportunities`

Request parsing and validation live in `app/_lib/server/request-parsers.ts`.

## Current Product Flows Powered By Persistence

### Watchlists

- `/assets` can create, edit, delete, and set default watchlists
- watchlist membership changes are persisted
- the dashboard reads the default persisted watchlist for its summary cards

### Trade tickets

- `/trade-tickets` can create, update, and delete persisted tickets
- `/trade-tickets/[ticketId]` can save notes and advance ticket status
- `/risk-lab` reads persisted tickets for risk sizing and gate display
- trade ticket preparation now reads persisted scanner results instead of prototype-only setup lists

### Scanner integration

- `/scanner` reads persisted scanner results and persisted trade tickets on the server
- preparing a setup creates a saved trade ticket immediately
- saved tickets keep `sourceSetupId` and `sourceAssetSymbol` so scanner output stays linked to ticket records

### Journal integration

- `/journal` can create, update, and delete persisted journal entries
- entries can link to a persisted trade ticket through `ticketId`
- the dashboard reminder panel is sourced from saved journal data

### Assets and market data

- `/assets` renders persisted asset records
- `/assets` can trigger a manual provider sync through `POST /api/market-data/sync`
- `/assets/[symbol]` now combines persisted asset, scanner result, backtest, watchlist, ticket, and journal data for symbol-level workspace context
- the app shell reads the persisted market snapshot and top persisted scanner result in its header/sidebar surfaces
- live sync now uses IG market snapshots for price refreshes and maintains rolling sparkline context locally between sync cycles
- internal composite symbols (`AINF`, `NUKZ`, `TKNX`) use listed ETF proxies during sync and return warnings in the sync summary

### Backtests

- `/backtesting-lab` now reads persisted backtest records
- the dashboard backtest panel is sourced from persisted backtest data
- backtest records now carry timeframe, date range, capital assumptions, cost assumptions, AI read, and linkage back to scanner results

### Intelligence layer

- the command center now reads persisted `aiOpportunities`, `marketEvents`, and `confirmationChecks`
- the research workspace now combines backtests, live drivers, confirmation memory, and AI recommendations
- the new intelligence entities are persisted in the same workspace document, so they can later be swapped to a real database without changing the page contracts first

## Current Schema

### Core entities

#### `workspaces`

Implemented as a single MVP workspace record.

- `id`
- `name`
- `createdAt`
- `updatedAt`

#### `watchlists`

Implemented.

- `id`
- `name`
- `description`
- `itemSymbols: string[]`
- `isDefault`
- `createdAt`
- `updatedAt`

#### `tradeTickets`

Implemented.

- all current ticket UI fields
- `sourceAssetSymbol`
- `sourceSetupId`
- `notes`
- `createdAt`
- `updatedAt`

#### `journalEntries`

Implemented.

- all current journal UI fields
- `ticketId`
- `createdAt`
- `updatedAt`

#### `assets`

Implemented.

- all current asset UI fields
- `source`
- `lastSyncedAt`
- `createdAt`
- `updatedAt`

#### `scannerResults`

Implemented.

- all current setup/scanner UI fields
- `thesis`
- `linkedAssetSymbol`
- `linkedBacktestId`
- `createdAt`
- `updatedAt`

#### `backtests`

Implemented.

- all current backtest snapshot fields
- `timeframe`
- `dateRange`
- `startingCapital`
- `feesBps`
- `slippageBps`
- `aiRead`
- `status`
- `linkedAssetSymbol`
- `linkedScannerResultId`
- `createdAt`
- `updatedAt`

#### `marketSnapshot`

Implemented.

- current market pulse fields from the prototype shell/dashboard
- `id`
- `createdAt`
- `updatedAt`

#### `marketEvents`

Implemented.

- `id`
- `title`
- `summary`
- `impact`
- `bias`
- `scope`
- `relatedSymbols`
- `startsAt`
- `sourceLabel`
- `sourceType`
- `status`
- `createdAt`
- `updatedAt`

#### `confirmationChecks`

Implemented.

- `id`
- `symbol`
- `stance`
- `summary`
- `score`
- `overallStatus`
- `linkedScannerResultId`
- `checks[]`
- `createdAt`
- `updatedAt`

#### `aiOpportunities`

Implemented.

- `id`
- `symbol`
- `side`
- `title`
- `summary`
- `confidence`
- `action`
- `entryPlan`
- `stopPlan`
- `targetPlan`
- `expectedMove`
- `invalidation`
- `marketContext`
- `newsContext`
- `confirmationContext`
- `linkedScannerResultId`
- `linkedBacktestId`
- `createdAt`
- `updatedAt`

### External ingestion layer

Implemented for MVP manual sync.

- provider: `ig`
- env:
  - `SIGNALIBRIUM_MARKET_DATA_PROVIDER=ig`
  - `SIGNALIBRIUM_IG_ENVIRONMENT=demo|live`
  - `SIGNALIBRIUM_IG_API_KEY`
  - `SIGNALIBRIUM_IG_IDENTIFIER`
  - `SIGNALIBRIUM_IG_PASSWORD`
  - `SIGNALIBRIUM_IG_ACCOUNT_ID` (optional but recommended)
- live sync route:
  - `POST /api/market-data/sync`
- sync summary returns:
  - `provider`
  - `syncedAt`
  - `syncedSymbols`
  - `skippedSymbols`
  - `warnings`
  - `assets`
  - `marketSnapshot`

### Still prototype or planned

These remain display-oriented or roadmap entities rather than fully modeled persisted services:

- `strategies`
- `riskProfiles`
- user/account ownership
- live scanner computation services
- real backtest execution jobs

## File Structure

```text
app/
  api/
    assets/
      route.ts
      [symbol]/route.ts
    backtests/
      route.ts
      [backtestId]/route.ts
    journal-entries/
      route.ts
      [entryId]/route.ts
    market-events/
      route.ts
    market-data/
      sync/route.ts
    market-snapshot/
      route.ts
    confirmation-checks/
      route.ts
    ai-opportunities/
      route.ts
    scanner-results/
      route.ts
      [resultId]/route.ts
    trade-tickets/
      route.ts
      [ticketId]/route.ts
    watchlists/
      route.ts
      [watchlistId]/route.ts
  assets/
    page.tsx
    assets-page-client.tsx
    [symbol]/page.tsx
  backtesting-lab/
    page.tsx
  journal/
    page.tsx
    journal-page-client.tsx
  scanner/
    page.tsx
    scanner-page-client.tsx
  trade-tickets/
    page.tsx
    trade-tickets-page-client.tsx
    [ticketId]/
      page.tsx
      trade-ticket-detail-client.tsx
  _lib/
    market-data-contract.ts
    server/
      market-data/
        asset-catalog.ts
        provider-types.ts
        sync-market-data.ts
        ig.ts
      repositories/
        ai-opportunities.ts
        assets.ts
        backtests.ts
        confirmation-checks.ts
        journal-entries.ts
        market-events.ts
        market-snapshot.ts
        scanner-results.ts
        trade-tickets.ts
        watchlists.ts
      request-parsers.ts
      workspace-seed.ts
      workspace-store.ts
      workspace-types.ts
data/
  workspace.json
docs/
  mvp-backend-foundation.md
```

## Storage Model

The file store is a single JSON document containing:

- `workspace`
- `watchlists`
- `tradeTickets`
- `journalEntries`
- `assets`
- `scannerResults`
- `backtests`
- `marketSnapshot`
- `marketEvents`
- `confirmationChecks`
- `aiOpportunities`
- `schemaVersion`
- `updatedAt`

The store is now on `schemaVersion: 4`, and older workspace files are normalized forward automatically so the newer entity arrays can be introduced without losing saved watchlists, tickets, journal entries, or prior market data.

## External Provider Notes

The current ingestion setup is intentionally conservative:

- it refreshes live prices from IG market snapshots for each persisted asset
- it avoids frequent historical-price pulls during routine syncs so the MVP stays inside IG historical-data quotas
- it seeds full candlestick history on demand for chart views, then live-updates the active candle from fresh market snapshots
- it updates `assets` and recomputes a persisted `marketSnapshot`
- it leaves scanner ranking logic and backtest computation as persisted product logic for now

IG Labs official docs indicate:

- `POST /session` returns CST and X-SECURITY-TOKEN session headers for authenticated API access
- `GET /markets/{epic}` returns live market snapshot fields such as `bid`, `offer`, and `percentageChange`
- `GET /prices/{epic}/{resolution}/{numPoints}` returns historical price bars for chart seeding
- default REST limits include 30 non-trading requests per minute per account and a 10,000 historical-price-point weekly allowance

## Provider Mesh Direction

Signalibrium now also has an explicit provider-mesh scaffold for the next stage of the trading engine.

Implemented:

- `app/_lib/server/market-data/provider-architecture.ts`
- `GET /api/market-data/providers`
- `docs/market-data-mesh-architecture.md`

This layer does not replace the sync engine yet. It documents and exposes the difference between:

- execution-grade truth
- confirmation-grade secondary feeds
- research-only enrichment

That distinction matters because the app currently contains a mix of stronger and weaker market-data sources, and the long-term trading engine should only permit automated execution when a symbol is covered by an official execution-grade provider and that provider is healthy.

In practical terms:

- `IG` is the target source of truth for live executable prices
- `CoinGecko` is suitable for secondary crypto confirmation and enrichment
- `Yahoo Finance` should be treated as research/chart support only, not as execution truth

The next build steps on this path are:

1. provider health tracking
2. source-divergence detection
3. symbol-level execution gating
4. degraded-mode UI and order blocking
5. migration away from weaker feeds in critical trade paths


## Migration Path Later

When the app is ready for a real backend:

1. keep the repository method signatures stable
2. replace file IO inside `workspace-store.ts`
3. map the same entity shapes into database tables
4. add auth and per-user workspace scoping
5. deepen the live ingestion layer into scheduled sync, scanner recomputation, and backtest execution services

That should allow the product surfaces to keep most of their existing contracts while the storage engine changes underneath.


