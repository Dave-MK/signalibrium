# MVP Backend Foundation

## Status

The backend foundation is now on its second meaningful milestone.

The app has a shared server-side persistence layer that:

- stores workspace data in a local JSON file
- exposes route handlers for watchlists, trade tickets, journal entries, assets, scanner results, backtests, and market snapshot
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
- `/assets/[symbol]` now combines persisted asset, scanner result, backtest, watchlist, ticket, and journal data for symbol-level workspace context
- the app shell reads the persisted market snapshot and top persisted scanner result in its header/sidebar surfaces

### Backtests

- `/backtesting-lab` now reads persisted backtest records
- the dashboard backtest panel is sourced from persisted backtest data
- backtest records now carry timeframe, date range, capital assumptions, cost assumptions, AI read, and linkage back to scanner results

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

### Still prototype or planned

These remain display-oriented or roadmap entities rather than fully modeled persisted services:

- `strategies`
- `riskProfiles`
- user/account ownership
- external market data ingestion
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
    market-snapshot/
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
    server/
      repositories/
        assets.ts
        backtests.ts
        journal-entries.ts
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
- `schemaVersion`
- `updatedAt`

The store is now on `schemaVersion: 2`, and older workspace files are normalized forward automatically so the newer entity arrays can be introduced without losing saved watchlists, tickets, or journal entries.

## Migration Path Later

When the app is ready for a real backend:

1. keep the repository method signatures stable
2. replace file IO inside `workspace-store.ts`
3. map the same entity shapes into database tables
4. add auth and per-user workspace scoping
5. replace seeded market/scanner/backtest entities with real ingestion and computation services

That should allow the product surfaces to keep most of their existing contracts while the storage engine changes underneath.
