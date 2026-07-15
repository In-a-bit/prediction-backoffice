# Builder onboarding — admin page to create & onboard builders

**Page:** `/admin/builders`
**Date:** 2026-07-15
**Status:** approved

## Problem

Admins need a way to onboard a new **builder** (a per-tenant record holding Privy
wallet credentials) from the backoffice UI: create the builder and hand its
freshly-minted API key to the builder for integration. Today the only way to
create a builder is a raw `curl` against dpm-api's admin endpoint with the shared
`x-api-key` — there is no UI, no RBAC, no audit trail, and no way to see which
builders already exist.

## Goals

1. An admin page that **creates** a builder by supplying its Privy wallet
   credentials, then surfaces the returned `api_public_key` **once** for handoff
   ("onboarding panel").
2. A **list** of existing builders (paginated, searchable) so admins can see what
   has been onboarded.
3. Route the whole flow through the Go backoffice proxy so the dpm-api admin key
   never reaches the browser, and RBAC + audit are enforced server-side.

## Non-goals (YAGNI)

- Editing / deactivating builders — no dpm-api endpoint exists.
- Rotating / revoking builder API keys — no dpm-api endpoint exists.
- Selecting `wallet_type` — hard-coded to `privy_proxy` (the only type we onboard
  today). `magic_proxy` / `eoa_proxy` would be a future code change.
- Showing the `api_public_key` in the list — dpm-api returns it only at creation
  and never again, so the onboarding panel is the single handoff moment.

## Architecture

Mirror the existing **Liquidity Providers** vertical slice at every layer. Data
flow:

```
Browser (admin UI)
  → Next BFF route  GET/POST /api/admin/builders     (forwards predictionsession cookie)
  → Go backoffice   GET/POST /proxy/dpm/builders      (RBAC builders.{read,manage} + audit; attaches admin X-API-Key)
  → dpm-api         GET/POST /builders                (admin group)
```

Rejected alternative: Next calling dpm-api directly via the existing `dpmRequest`
helper. It would leak the dpm-api admin key into the Next server env and bypass
Go's RBAC + audit. The requirement is explicitly to proxy through the Go
backoffice.

---

## Design — dpm-api (`prediction-go/apps/dpm-api`)

Only one new endpoint; `POST /builders` and all builder types already exist and
are unchanged.

### `GET /builders` (admin group)
- New handler `BuilderHandler.ListBuilders`, modeled on
  `LiquidityProviderHandler.ListLiquidityProviders`.
- Query params: `search` (case-insensitive `name` match via ent `NameContainsFold`),
  `limit`, `offset` (via `ginpagination` / the same `pageParams` helper used by LP).
- Query: `Builder.Query().Where(<search filter>).Order(ent.Desc(builder.FieldCreatedAt)).Limit().Offset()`,
  plus a `Count()` for `total`.
- Response body (mirrors LP list shape):
  `{ data: BuilderPublicResponse[], total, limit, offset, total_pages }`.
  `BuilderPublicResponse` already exists and carries **no secrets**
  (`id, name, wallet_type, wallet_public_key, created_at, updated_at`).
- Registered in `server.go` in the **admin group**, next to the existing
  `admin.POST("/builders", ...)` and the LP list route (line ~162).

---

## Design — Go backoffice (`prediction-go/apps/backoffice`)

### `handlers/dpm_proxy.go`
Add two methods, copies of `ListLiquidityProviders` / `CreateLiquidityProvider`,
both using the **admin key** (`h.adminKey`):
- `ListBuilders` — GET, forwards `search`, `limit`, `offset` to dpm-api `/builders`.
- `CreateBuilder` — POST, streams `c.Request.Body` to dpm-api `/builders`.

### `internal/authz/permissions.go`
- Add `BuildersRead Permission = "builders.read"` and
  `BuildersManage Permission = "builders.manage"`.
- Add a `builders` catalog domain (label "Builders") with the two entries,
  placed next to the `liquidity_providers` domain.
- Grant `builders.read` + `builders.manage` in the same preset role(s) that
  receive `liquidity_providers.manage` today, so an existing admin role can see
  and use the page without manual role editing.

### `server.go`
Register under group `a` (RBAC via `req(...)` + audit middleware inherited),
next to the LP proxy routes:
- `a.GET("/proxy/dpm/builders", req(authz.BuildersRead), s.dpmProxyHandler.ListBuilders)`
- `a.POST("/proxy/dpm/builders", req(authz.BuildersManage), s.dpmProxyHandler.CreateBuilder)`

---

## Design — Next.js backoffice (`prediction-backoffice`)

### `lib/api.ts`
- Types:
  - `BuilderRow = { id; name; wallet_type; wallet_public_key; created_at; updated_at }`
  - `CreateBuilderInput = { name; wallet_public_key; wallet_secret_key; wallet_verification_key?; wallet_type: "privy_proxy" }`
  - `CreateBuilderResult = { api_public_key: string }`
- `builders` object using `request()` (session-authed to Go), mirroring
  `liquidityProviders`:
  - `list(params) → request<Paginated<BuilderRow>>("/proxy/dpm/builders" + query)`
  - `create(input) → request<CreateBuilderResult>("/proxy/dpm/builders", { method: "POST", body })`

### `app/api/admin/builders/route.ts` (BFF)
Copy of the LP route handler:
- `GET` — pass `search`/`limit`/`offset` through to `builders.list`, return JSON.
- `POST` — validate required fields (`name`, `wallet_public_key`,
  `wallet_secret_key` non-empty), inject `wallet_type: "privy_proxy"`, call
  `builders.create`, return `201`. Errors via `proxyError`.

### `app/(app)/admin/builders/page.tsx` (UI)
Client page modeled on `admin/liquidity-providers/page.tsx`.

- **Create builder** card, gated on `useCan("builders.manage")`:
  - `Name` — text, required.
  - `Wallet public key` — text, required (Privy app id).
  - `Wallet secret key` — `type="password"` (masked; it is a secret), required
    (Privy app secret).
  - `Wallet verification key` — `<textarea>`, optional (Privy PEM).
  - `wallet_type` is not shown; `"privy_proxy"` is sent in the payload.
- **Onboarding panel** (on create success): an `InfoMessage` prominently showing
  the returned `api_public_key` with a Copy button and a short "Give this API key
  to the builder — it is shown only once" note. Form resets; list reloads.
- **Builders table**: columns `Name`, `Wallet type`, `Wallet public key`,
  `Created`. Debounced search box + Previous/Next pagination, exactly like LP.
  Read-only (no per-row actions).

### `components/nav.tsx`
Add a "Builders" item under the **Admin** group, `requires: "builders.read"`,
placed after "Liquidity Providers". Reuse a simple inline SVG icon.

---

## Testing

- **dpm-api**: unit test for `ListBuilders` — pagination (limit/offset/total),
  `search` name filter, and that the response contains no secret fields. Mirror
  the LP list test.
- **Go backoffice**: proxy route test asserting the `builders.manage` gate on
  `POST /proxy/dpm/builders` (403 without permission) and admin-key forwarding,
  mirroring the LP proxy test if one exists.
- **Manual e2e**: from the UI, create a builder using the sample Privy
  credentials; confirm the `api_public_key` appears once in the onboarding panel,
  the new row appears in the list, and search finds it.

## Risk / open questions

- The `api_public_key` is unrecoverable after creation. The onboarding panel is
  the only handoff point; if the admin misses it, the builder must be recreated.
  Copy button + explicit "shown once" warning mitigate this.
- `search` on the builders list depends on adding the ent filter in dpm-api; if
  the ent `builder` package lacks `NameContainsFold`, fall back to `NameEQ` or an
  unfiltered list + client-side filter (decided during implementation).

## Files changed

**prediction-go/apps/dpm-api**
- `handlers/builder.go` — new `ListBuilders` handler.
- `server.go` — register `admin.GET("/builders", ...)`.
- `handlers/builder_test.go` (or equivalent) — `ListBuilders` unit test.

**prediction-go/apps/backoffice**
- `handlers/dpm_proxy.go` — `ListBuilders`, `CreateBuilder` proxy methods.
- `internal/authz/permissions.go` — `builders.{read,manage}` + catalog domain + preset-role grant.
- `server.go` — register the two `/proxy/dpm/builders` routes.

**prediction-backoffice**
- `lib/api.ts` — builder types + `builders` client object.
- `app/api/admin/builders/route.ts` — new BFF route (GET + POST).
- `app/(app)/admin/builders/page.tsx` — new admin page.
- `components/nav.tsx` — "Builders" nav item.
