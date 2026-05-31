# MVP Backend Foundation

## Current milestone

The frontend shell is in place. The next MVP milestone is a backend foundation that can:

- persist user workspace data
- expose simple route handlers for product features
- keep repository boundaries clean so a real database can replace the storage engine later

## Chosen first-step approach

For this milestone, the app uses a **server-side file-backed store** instead of introducing a database dependency immediately.

Why:

- it works inside the current repo without extra packages
- it gives us real persistence right now
- it lets us define the domain model and repository layer before we commit to Supabase, Postgres, or another database

## Schema plan

### Core entities for MVP

#### `users`

Not implemented yet, but planned fields:

- `id`
- `email`
- `displayName`
- `createdAt`
- `updatedAt`

#### `workspaces`

Implemented as a single MVP workspace record in the file store for now.

- `id`
- `name`
- `createdAt`
- `updatedAt`

#### `watchlists`

First persistence layer implemented.

- `id`
- `name`
- `description`
- `itemSymbols: string[]`
- `isDefault`
- `createdAt`
- `updatedAt`

#### `tradeTickets`

First persistence layer implemented.

- all current ticket fields from the UI model
- `sourceAssetSymbol`
- `sourceSetupId`
- `notes`
- `createdAt`
- `updatedAt`

#### `journalEntries`

First persistence layer implemented.

- all current journal fields from the UI model
- `ticketId`
- `createdAt`
- `updatedAt`

### Planned next entities

These are defined as roadmap items, not persisted yet:

- `assets`
- `scannerResults`
- `strategies`
- `backtests`
- `riskProfiles`
- `marketSnapshots`

## File structure

```text
app/
  api/
    journal-entries/
      route.ts
      [entryId]/route.ts
    trade-tickets/
      route.ts
      [ticketId]/route.ts
    watchlists/
      route.ts
      [watchlistId]/route.ts
  _lib/
    server/
      repositories/
        journal-entries.ts
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

## Storage model

The file store is a single JSON document:

- `workspace`
- `watchlists`
- `tradeTickets`
- `journalEntries`
- `schemaVersion`
- `updatedAt`

This is intentionally simple for MVP iteration.

## Migration path later

When the app is ready for a real backend:

1. keep the repository method signatures
2. replace file IO in `workspace-store.ts`
3. map the same entity shapes into database tables
4. add auth and per-user workspace scoping

That means the UI and route handlers should need minimal changes.
