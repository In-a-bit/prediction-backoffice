# Crypto-interval task detail — markets table filtering & detail drawer

**Page:** `/automations/crypto-interval/[id]`
**Date:** 2026-05-23
**Status:** approved (auto mode)

## Problem

The "Recent markets" table shows the latest 100 rows with no filtering. A 5-minute crypto interval produces ~288 rows/day and ~2000 rows/week. Operators need to focus on what's actively in-flight or broken, not scroll a wall of verified rows.

## Goals

1. Default the view to what's actionable (active markets) but let operators switch to verified / failed / all.
2. Show 10 rows by default, expandable to 25/100/All.
3. Make each row clickable to reveal full per-market detail (timestamps, external IDs, error text, deep links).

## Non-goals

- Backend filter parameters (`?status`, `?before`). Tracked as follow-up; client currently fetches a larger bucket and filters locally.
- URL-state sync for the filter selection.
- Infinite scroll / virtualization.

## Design

### Fetch
- Server page bumps `crypto.listTaskMarkets(numericId, 500)` from 100 to 500. Covers ~40 hours of 5-min slots, enough that "Active" and "Failed (recent)" are always present.
- Initial markets array is passed into a new client component.

### Client component: `components/crypto-interval/markets-panel.tsx`
Owns filter state, page-size state, and the selected-row state.

**Filter pills:** `Active` (default · `status=PENDING` OR `status=CREATED && !verified_at`) · `Verified` (`status=CREATED && verified_at`) · `Failed` (`status=FAILED`) · `Awaiting price` (`status=PENDING && slot_end < now`) · `All`.

**Search box:** case-insensitive substring match on `slug` and `market_external_id`.

**Page size:** `10 / 25 / 100 / All`, default `10`. Renders `filtered.slice(0, pageSize)`.

**Counters:** `<active> active · <verified> verified · <failed> failed of <loaded> loaded`.

### Row → Drawer
Clicking a row opens a right-side drawer (slides in from the right edge, 28rem wide, fixed overlay backdrop). Drawer content:
- Header: status badge, slug, copy-id buttons.
- Timestamps section: slot_start, slot_end, created_at, updated_at, verified_at — each shown as relative + full ISO.
- Identifiers: full `slug`, `market_external_id`, `event_external_id` with copy-to-clipboard.
- `price_to_beat`.
- Error block (full text, scrollable, only when present).
- Deep links: `/markets/<market_external_id>`, `/events/<event_external_id>`.

Drawer closes on: Escape key, backdrop click, X button.

### Accessibility
- Native `<dialog>` element via `useRef`/`showModal()` for focus trapping.
- Clickable `<tr>` becomes a `<button>`-styled row; keyboard accessible.

## Risk / open questions

- For week-scale (2k+ rows), 500 limit is not enough. Follow-up: add `?status` + `?before` query params server-side and switch the client to "load more". Out of scope for this change.

## Files changed

- `app/automations/crypto-interval/[id]/page.tsx` — bump fetch limit, swap embedded table for `<MarketsPanel/>`.
- `components/crypto-interval/markets-panel.tsx` — new client component (filters + table + drawer).
