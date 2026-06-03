# Market Data Mesh Architecture

## Objective

Build Signalibrium’s live trading brain on a provider mesh instead of a single feed.

That mesh should:

- preserve execution safety
- improve resilience and uptime
- support AI cross-reference and confirmation logic
- degrade safely when a provider fails

## Core Rule

Not all market data sources are equal.

Signalibrium should explicitly separate:

- `execution-grade truth`
- `confirmation-grade secondary data`
- `research-only enrichment`

The app should never treat a convenient website feed the same as an executable broker feed.

## Source Classes

### 1. Execution-grade truth

Use for:

- live prices used in order planning
- stop/target calculations
- trade routing
- order verification
- account-linked position management

Current provider:

- `IG`

Why:

- official broker API
- executable price context
- streaming support
- account and order integration

Rule:

- if IG is down, the app must not silently fall back into auto-trading from a weaker feed

### 2. Confirmation-grade secondary data

Use for:

- source divergence checks
- market breadth and context
- AI confidence adjustment
- chart enrichment
- non-execution validation

Current/available examples:

- `CoinGecko` for crypto confirmation and breadth context
- future official additions such as `Nasdaq Data Link` or other licensed market-data APIs

Rule:

- secondary feeds can raise or lower confidence
- they cannot independently authorize automated execution

### 3. Research-only enrichment

Use for:

- non-critical chart fallback
- exploratory research
- AI memory enrichment

Current example:

- `Yahoo Finance`

Rule:

- keep out of order automation, pricing truth, and uptime guarantees
- phase out from critical live decisioning where possible

## Recommended Mesh

### Layer A: Execution plane

- `IG REST`
- `IG Streaming`

Responsibilities:

- live executable quotes
- account state
- order placement
- order lifecycle
- fallback REST snapshots when the stream reconnects

### Layer B: Confirmation plane

- `CoinGecko` for crypto cross-checks
- future official equity/ETF confirmation feed
- future macro/sector market-data APIs where licensed

Responsibilities:

- confirm direction and magnitude
- detect suspicious feed divergence
- enrich AI memory
- validate regime changes

### Layer C: Intelligence plane

- official news feeds
- official central bank feeds
- official economic calendar providers
- filings / exchange notices

Responsibilities:

- event detection
- catalyst weighting
- macro risk state
- narrative confirmation or invalidation

### Layer D: Research plane

- chart fallbacks
- exploratory-only sources

Responsibilities:

- keep interfaces useful during outages
- support manual investigation

Constraints:

- must never be promoted to trading truth automatically

## Cross-reference Rules

### Opportunity promotion

An AI opportunity should be promoted only if:

1. the execution-grade source is healthy
2. the signal remains valid against market-memory/backtest context
3. at least one secondary source or intelligence layer confirms the setup context
4. no material divergence or event risk blocks it

### Divergence handling

If primary and secondary sources diverge beyond tolerance:

- mark the symbol as `source conflict`
- block one-click execution
- downgrade confidence
- surface the conflict in the UI

Suggested starting tolerances:

- crypto: `0.75%`
- ETFs / listed proxies: `0.35%`

These are starting guardrails, not final numbers.

### Degraded mode

If the execution-grade provider is unavailable:

- disable automated trade triggering
- keep charts and research running from lower-trust feeds
- show stale-data / degraded-mode banners
- require manual confirmation for any trade planning

## Uptime Strategy

To target operational resilience, use:

### 1. Stream + REST pairing

- stream for live updates
- REST for recovery, reseeding, and verification

### 2. Health checks

Track per provider:

- auth state
- latency
- last success timestamp
- error streak
- rate-limit state

### 3. Circuit breakers

If a provider repeatedly fails:

- stop hammering it
- open a cooldown
- fall back to permitted lower-priority behavior

### 4. Cached last-known-good data

Keep:

- last valid quote
- last valid candle series
- last valid sync summary

Use these only with explicit stale markers.

### 5. Symbol-level quarantine

If one symbol is inconsistent:

- quarantine that symbol only
- keep the rest of the mesh live

## Policy On Website Scraping

Signalibrium should not use scraped website data as:

- a primary live price source
- an order-routing dependency
- an execution confirmation source
- an uptime guarantee layer

If website-derived data is ever used at all, it should be limited to:

- non-critical research enrichment
- terms-permitted use cases
- clearly lower trust than licensed APIs

## Current State vs Target State

### Current state

- `IG` is the only execution-grade source
- `CoinGecko` is useful as secondary crypto context
- `Yahoo Finance` is currently being used for some non-IG proxy data and should be treated cautiously

### Target state

- `IG` becomes the clear primary source of truth for all tradable execution paths
- secondary official/licensed providers are added for confirmation
- Yahoo-style unofficial dependencies are reduced or removed from critical live logic

## Immediate Engineering Steps

1. Add a provider registry with trust level, role, and automation policy
2. Add provider health reporting and expose it through an API route
3. Add symbol-level execution safety policy
4. Add source-divergence checks before opportunity promotion
5. Migrate symbols still relying on weaker feeds toward official execution-grade or licensed confirmation feeds
6. Add UI banners for `healthy`, `degraded`, `stale`, and `source conflict`

## Current Scaffold In Repo

The repo now includes:

- `app/_lib/server/market-data/provider-architecture.ts`
- `GET /api/market-data/providers`

This scaffold describes:

- provider trust level
- provider role
- automation policy
- current state
- symbol-by-symbol migration priority

It is the starting point for a full provider health and quorum system.
