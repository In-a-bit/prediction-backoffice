# Builder Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin page at `/admin/builders` in the Next.js backoffice to create (onboard) builders and list existing ones, proxying through the Go backoffice to dpm-api.

**Architecture:** A vertical slice mirroring the existing Liquidity-Providers feature. Browser → Next BFF route (`/api/admin/builders`) → Go backoffice (`/proxy/dpm/builders`, RBAC + audit, holds the dpm-api admin key) → dpm-api (`/builders`, admin group). One new dpm-api endpoint (`GET /builders`); `POST /builders` already exists.

**Tech Stack:** Go 1.x + gin + ent (prediction-go monorepo); Next.js 16.2.4 App Router + React 19.2.4 + Tailwind (prediction-backoffice).

## Global Constraints

- **Two git repos.** dpm-api and backoffice both live in `prediction-go/` (one repo). The UI lives in `prediction-backoffice/` (separate repo). Commit in the repo each task touches.
- **`wallet_type` is fixed to `"privy_proxy"`** — never exposed in the UI; injected server-side in the payload.
- **`api_public_key` is returned only at creation and is unrecoverable** — surface it once in the onboarding panel; never attempt to show it in the list.
- **List responses carry no secret material** — use the existing `BuilderPublicResponse` (`id, name, wallet_type, wallet_public_key, created_at, updated_at`).
- **No new config** — the Go backoffice already has `DPMAPIBaseURL` + admin key wired for LP; reuse `h.adminKey`.
- **RBAC + audit are free at the route layer** — routes registered under group `a` in `backoffice/server.go` inherit `AuditMiddleware`; gate with `req(authz.Builders…)`.
- **Next.js is customized** (see `prediction-backoffice/AGENTS.md`): consult `node_modules/next/dist/docs/` if any App Router convention is unclear. `cookies()` is async and already handled inside `lib/api.ts`'s `request()`. The existing LP files are the reference implementation — copy their shape.
- **Command working directories:** Go commands run from `/home/yuvala/Documents/prediction-claude/prediction-go`; Next commands from `/home/yuvala/Documents/prediction-claude/prediction-backoffice`. `devtool` is running — rebuild Go services with `.bin/devtool rebuild <service>` (`dpm-api` @ 8086, `backoffice` @ 8092).

---

## Pre-flight: branches

- [ ] **Create a feature branch in each repo** (both are on their default branch)

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go && git checkout -b feat/builder-onboarding
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice && git checkout -b feat/builder-onboarding
```

---

## Task 1: dpm-api — `GET /builders` list endpoint

**Files:**
- Modify: `prediction-go/apps/dpm-api/handlers/builder.go` (add `builderSearchFilters` + `ListBuilders`)
- Modify: `prediction-go/apps/dpm-api/server.go` (register route, admin group ~line 161)
- Test: `prediction-go/apps/dpm-api/handlers/builder_test.go` (new file — pure test for `builderSearchFilters`)

**Interfaces:**
- Consumes: existing `pageParams(c) (limit, offset int, ok bool)`, `BuilderPublicFromEnt(*ent.Builder) BuilderPublicResponse`, `h.store.Ent().Builder`, `entbuilder.NameContainsFold`, `entbuilder.FieldCreatedAt` (all already present in the package).
- Produces: `GET /builders?search=&limit=&offset=` returning `{data: BuilderPublicResponse[], total, limit, offset, total_pages}`.

- [ ] **Step 1: Write the failing test**

Create `prediction-go/apps/dpm-api/handlers/builder_test.go`:

```go
package handlers

import "testing"

func TestBuilderSearchFilters(t *testing.T) {
	if got := builderSearchFilters(""); len(got) != 0 {
		t.Errorf("empty search: got %d predicates, want 0", len(got))
	}
	if got := builderSearchFilters("   "); len(got) != 0 {
		t.Errorf("blank search: got %d predicates, want 0", len(got))
	}
	if got := builderSearchFilters("acme"); len(got) != 1 {
		t.Errorf("non-empty search: got %d predicates, want 1", len(got))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && go test ./apps/dpm-api/handlers/ -run TestBuilderSearchFilters`
Expected: FAIL — `undefined: builderSearchFilters`.

- [ ] **Step 3: Add the filter helper + list handler**

In `prediction-go/apps/dpm-api/handlers/builder.go`, add `"math"` and the predicate package to the imports:

```go
	"math"

	"github.com/In-a-bit/prediction-go/libs/db/ent/predicate"
```

Then append these two functions to the file:

```go
// builderSearchFilters builds the WHERE predicates for ListBuilders from the
// optional ?search= term (case-insensitive match on name). Returns nil when no
// search term is present.
func builderSearchFilters(search string) []predicate.Builder {
	search = strings.TrimSpace(search)
	if search == "" {
		return nil
	}
	return []predicate.Builder{entbuilder.NameContainsFold(search)}
}

// ListBuilders handles GET /builders. Paginated, newest first, optional
// ?search= on name. Returns no secret material (BuilderPublicResponse).
func (h *BuilderHandler) ListBuilders(c *gin.Context) {
	ctx := c.Request.Context()
	filters := builderSearchFilters(c.Query("search"))
	limit, offset, ok := pageParams(c)
	if !ok {
		return
	}

	total, err := h.store.Ent().Builder.Query().Where(filters...).Count(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "failed to count builders"})
		return
	}

	builders, err := h.store.Ent().Builder.Query().
		Where(filters...).
		Order(ent.Desc(entbuilder.FieldCreatedAt)).
		Limit(limit).
		Offset(offset).
		All(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "failed to list builders"})
		return
	}

	rows := make([]BuilderPublicResponse, 0, len(builders))
	for _, b := range builders {
		rows = append(rows, BuilderPublicFromEnt(b))
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        rows,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
		"total_pages": int(math.Ceil(float64(total) / float64(limit))),
	})
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && go test ./apps/dpm-api/handlers/ -run TestBuilderSearchFilters`
Expected: PASS (`ok  ...`).

- [ ] **Step 5: Register the route**

In `prediction-go/apps/dpm-api/server.go`, directly after `admin.POST("/builders", s.builderHandler.CreateBuilder)` (~line 161), add:

```go
		admin.GET("/builders", s.builderHandler.ListBuilders)
```

- [ ] **Step 6: Build and rebuild the service**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
go build ./apps/dpm-api/... && .bin/devtool rebuild dpm-api
```
Expected: build succeeds; `rebuild` reports dpm-api started.

- [ ] **Step 7: Manual smoke test against dpm-api**

Run (admin key from your curl example):
```bash
curl -s 'http://localhost:8086/builders?limit=5' -H 'x-api-key: dpm-api-key' | head -c 400
```
Expected: JSON `{"data":[...],"total":...,"limit":5,"offset":0,"total_pages":...}` with builder rows containing `name`/`wallet_type`/`wallet_public_key` and **no** secret fields.

- [ ] **Step 8: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
git add apps/dpm-api/handlers/builder.go apps/dpm-api/handlers/builder_test.go apps/dpm-api/server.go
git commit -m "feat(dpm-api): add GET /builders list endpoint"
```

---

## Task 2: backoffice — `builders.read` / `builders.manage` permissions

**Files:**
- Modify: `prediction-go/apps/backoffice/internal/authz/permissions.go` (constants ~after line 46; catalog domain ~after line 109)
- Test: `prediction-go/apps/backoffice/internal/authz/permissions_test.go` (add one test)

**Interfaces:**
- Produces: `authz.BuildersRead` (`"builders.read"`), `authz.BuildersManage` (`"builders.manage"`), both valid catalog permissions. Consumed by Task 3's route registration.

- [ ] **Step 1: Write the failing test**

Append to `prediction-go/apps/backoffice/internal/authz/permissions_test.go`:

```go
func TestBuildersPermissionsInCatalog(t *testing.T) {
	for _, p := range []Permission{BuildersRead, BuildersManage} {
		if !IsValid(p) {
			t.Errorf("permission %q is not in the catalog", p)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && go test ./apps/backoffice/internal/authz/ -run TestBuildersPermissionsInCatalog`
Expected: FAIL — `undefined: BuildersRead`.

- [ ] **Step 3: Add the constants**

In `permissions.go`, directly after the `LiquidityProvidersRead`/`LiquidityProvidersManage` block (~line 46):

```go
	BuildersRead   Permission = "builders.read"
	BuildersManage Permission = "builders.manage"
```

- [ ] **Step 4: Add the catalog domain**

In `Catalog()`, directly after the `liquidity_providers` domain block (~line 109), add:

```go
		{Domain: "builders", Label: "Builders", Permissions: []CatalogEntry{
			{BuildersRead, "View builders", "See onboarded builders."},
			{BuildersManage, "Manage builders", "Create builders and issue their API keys."},
		}},
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && go test ./apps/backoffice/internal/authz/`
Expected: PASS (all authz tests, including the new one).

- [ ] **Step 6: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
git add apps/backoffice/internal/authz/permissions.go apps/backoffice/internal/authz/permissions_test.go
git commit -m "feat(backoffice): add builders.read/builders.manage permissions"
```

---

## Task 3: backoffice — proxy handlers + routes for `/proxy/dpm/builders`

**Files:**
- Modify: `prediction-go/apps/backoffice/handlers/dpm_proxy.go` (add two methods after the LP methods, ~line 245)
- Modify: `prediction-go/apps/backoffice/server.go` (register two routes after the LP block, ~line 168)

**Interfaces:**
- Consumes: `h.proxy(...)`, `h.adminKey` (existing on `DpmProxyHandler`); `authz.BuildersRead`, `authz.BuildersManage` (Task 2).
- Produces: `GET /proxy/dpm/builders`, `POST /proxy/dpm/builders` on the backoffice, session-authed + RBAC-gated, forwarding to dpm-api with the admin key. Consumed by Task 4's `lib/api.ts`.

- [ ] **Step 1: Add the proxy methods**

In `prediction-go/apps/backoffice/handlers/dpm_proxy.go`, after `RevokeLiquidityProviderKey` (end of file), add:

```go
// GET /proxy/dpm/builders?search=&limit=&offset=
func (h *DpmProxyHandler) ListBuilders(c *gin.Context) {
	q := url.Values{}
	for _, k := range []string{"search", "limit", "offset"} {
		if v := c.Query(k); v != "" {
			q.Set(k, v)
		}
	}
	h.proxy(c, http.MethodGet, "/builders", q, nil, h.adminKey)
}

// POST /proxy/dpm/builders — create a builder; body streamed to dpm-api as-is.
func (h *DpmProxyHandler) CreateBuilder(c *gin.Context) {
	h.proxy(c, http.MethodPost, "/builders", nil, c.Request.Body, h.adminKey)
}
```

- [ ] **Step 2: Register the routes**

In `prediction-go/apps/backoffice/server.go`, after the liquidity-providers route block (~line 168), add:

```go

	// --- Builders (dpm-api admin proxy; reads = builders.read, writes = builders.manage) ---
	a.GET("/proxy/dpm/builders", req(authz.BuildersRead), s.dpmProxyHandler.ListBuilders)
	a.POST("/proxy/dpm/builders", req(authz.BuildersManage), s.dpmProxyHandler.CreateBuilder)
```

- [ ] **Step 3: Build and rebuild the service**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
go build ./apps/backoffice/... && .bin/devtool rebuild backoffice
```
Expected: build succeeds; `rebuild` reports backoffice started.

- [ ] **Step 4: Confirm the routes are wired**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && .bin/devtool logs backoffice 40 | grep -i builders`
Expected: gin route-registration lines showing `GET /proxy/dpm/builders` and `POST /proxy/dpm/builders` (end-to-end auth is exercised in Task 6 via the UI, which supplies a real session cookie).

- [ ] **Step 5: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
git add apps/backoffice/handlers/dpm_proxy.go apps/backoffice/server.go
git commit -m "feat(backoffice): proxy /proxy/dpm/builders to dpm-api"
```

---

## Task 4: Next.js BFF — `lib/api.ts` client + `/api/admin/builders` route

**Files:**
- Modify: `prediction-backoffice/lib/api.ts` (add types + `builders` object after the `liquidityProviders` block, ~line 923)
- Create: `prediction-backoffice/app/api/admin/builders/route.ts`

**Interfaces:**
- Consumes: existing `request<T>()`, `Paginated<T>`, `proxyError`.
- Produces: `builders.list(params)`, `builders.create(input)`; types `BuilderRow`, `CreateBuilderInput`, `CreateBuilderResult`; BFF routes `GET`/`POST /api/admin/builders`. Consumed by Task 5's page.

- [ ] **Step 1: Add types + client to `lib/api.ts`**

After the `liquidityProviders` export (~line 923), add:

```ts
export type BuilderRow = {
  id: number;
  name: string;
  wallet_type: string;
  wallet_public_key: string;
  created_at: string;
  updated_at: string;
};

export type CreateBuilderInput = {
  name: string;
  wallet_public_key: string;
  wallet_secret_key: string;
  wallet_verification_key?: string;
};

export type CreateBuilderResult = { api_public_key: string };

function builderQuery(params: { search?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const builders = {
  list: (params: { search?: string; limit?: number; offset?: number } = {}) =>
    request<Paginated<BuilderRow>>(`/proxy/dpm/builders${builderQuery(params)}`),
  create: (input: CreateBuilderInput) =>
    request<CreateBuilderResult>("/proxy/dpm/builders", {
      method: "POST",
      // wallet_type is fixed for now; the dpm-api accepts it in the body.
      body: { ...input, wallet_type: "privy_proxy" },
    }),
};
```

- [ ] **Step 2: Create the BFF route handler**

Create `prediction-backoffice/app/api/admin/builders/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

import { builders, type CreateBuilderInput } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params: { search?: string; limit?: number; offset?: number } = {};
    if (sp.get("search")) params.search = sp.get("search") ?? undefined;
    const limit = sp.get("limit");
    const offset = sp.get("offset");
    if (limit) params.limit = Number.parseInt(limit, 10);
    if (offset) params.offset = Number.parseInt(offset, 10);
    const data = await builders.list(params);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateBuilderInput>;
    if (
      !body?.name?.trim() ||
      !body?.wallet_public_key?.trim() ||
      !body?.wallet_secret_key?.trim()
    ) {
      return NextResponse.json(
        { error: "name, wallet_public_key, and wallet_secret_key are required" },
        { status: 400 },
      );
    }
    const data = await builders.create({
      name: body.name.trim(),
      wallet_public_key: body.wallet_public_key.trim(),
      wallet_secret_key: body.wallet_secret_key.trim(),
      wallet_verification_key: body.wallet_verification_key?.trim() || undefined,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return proxyError(err);
  }
}
```

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: no type errors; lint passes (no new warnings for the added files).

- [ ] **Step 4: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
git add lib/api.ts app/api/admin/builders/route.ts
git commit -m "feat(ui): add builders BFF client and /api/admin/builders route"
```

---

## Task 5: Next.js UI — `/admin/builders` page + nav entry

**Files:**
- Create: `prediction-backoffice/app/(app)/admin/builders/page.tsx`
- Modify: `prediction-backoffice/components/nav.tsx` (add item after the liquidity-providers item, ~line 304)

**Interfaces:**
- Consumes: `builders` BFF routes (Task 4) via `fetch("/api/admin/builders")`; `useCan("builders.manage")`; `BuilderRow` type; UI kit (`Card`, `CardHeader`, `CardBody`, `Field`, `inputClass`, `buttonVariants`, `ErrorMessage`, `InfoMessage`, `PageHeader`).
- Produces: the admin page + a "Builders" nav link gated on `builders.read`.

- [ ] **Step 1: Create the page**

Create `prediction-backoffice/app/(app)/admin/builders/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/permission-context";
import {
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  Field,
  InfoMessage,
  PageHeader,
  buttonVariants,
  inputClass,
} from "@/components/ui";
import type { BuilderRow } from "@/lib/api";

const DEFAULT_PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 300;

type ListResponse = {
  data: BuilderRow[];
  total: number;
  limit: number;
  offset: number;
};

export default function BuildersPage() {
  const canManage = useCan("builders.manage");

  const [rows, setRows] = useState<BuilderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [createName, setCreateName] = useState("");
  const [createPublicKey, setCreatePublicKey] = useState("");
  const [createSecretKey, setCreateSecretKey] = useState("");
  const [createVerificationKey, setCreateVerificationKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const offset = (page - 1) * perPage;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (debouncedSearch) sp.set("search", debouncedSearch);
      sp.set("limit", String(perPage));
      sp.set("offset", String(offset));
      const res = await fetch(`/api/admin/builders?${sp.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset, perPage]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce the search box: apply the term after the user pauses typing and
  // reset to the first page, so each keystroke doesn't fire its own request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / perPage)),
    [total, perPage],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setCreateError("");
    setCreatedKey("");
    setCopied(false);
    try {
      const res = await fetch("/api/admin/builders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          wallet_public_key: createPublicKey.trim(),
          wallet_secret_key: createSecretKey.trim(),
          wallet_verification_key: createVerificationKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { api_public_key?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setCreatedKey(data.api_public_key ?? "");
      setCreateName("");
      setCreatePublicKey("");
      setCreateSecretKey("");
      setCreateVerificationKey("");
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Builders"
        description="Onboard builders and issue their API keys."
      />

      {canManage && (
        <Card>
          <CardHeader>Onboard builder</CardHeader>
          <CardBody className="space-y-4">
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Wallet public key (Privy app id)">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  value={createPublicKey}
                  onChange={(e) => setCreatePublicKey(e.target.value)}
                  required
                />
              </Field>
              <Field label="Wallet secret key (Privy app secret)">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  type="password"
                  value={createSecretKey}
                  onChange={(e) => setCreateSecretKey(e.target.value)}
                  required
                />
              </Field>
              <Field label="Wallet verification key (PEM, optional)">
                <textarea
                  className={`${inputClass} min-h-[80px] font-mono text-xs`}
                  value={createVerificationKey}
                  onChange={(e) => setCreateVerificationKey(e.target.value)}
                />
              </Field>
              <div className="flex items-end md:col-span-2">
                <button type="submit" className={buttonVariants.primary} disabled={creating}>
                  {creating ? "Creating…" : "Create builder"}
                </button>
              </div>
            </form>
            {createError && <ErrorMessage>{createError}</ErrorMessage>}
            {createdKey && (
              <InfoMessage>
                <div className="space-y-2">
                  <div className="font-medium">
                    Builder onboarded. Give this API key to the builder — it is shown only once.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs break-all">{createdKey}</code>
                    <button
                      type="button"
                      className={buttonVariants.secondary}
                      onClick={() => copyKey(createdKey)}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </InfoMessage>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>Builders</CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Search name">
              <input
                className={inputClass}
                data-lpignore="true"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Wallet type</th>
                  <th className="py-2 pr-3">Wallet public key</th>
                  <th className="py-2 pr-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-foreground-muted">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-foreground-muted">
                      No builders found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">{row.name}</td>
                      <td className="py-3 pr-3">{row.wallet_type}</td>
                      <td className="py-3 pr-3">
                        <code className="text-xs break-all">{row.wallet_public_key}</code>
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-foreground-muted">
            <span className="tabular-nums">
              {total === 0
                ? "No results"
                : `${offset + 1}–${Math.min(offset + perPage, total)} of ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={buttonVariants.secondary}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className={buttonVariants.secondary}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav item**

In `prediction-backoffice/components/nav.tsx`, directly after the liquidity-providers item object (closes ~line 304), inside the same `items` array, add:

```tsx
      {
        href: "/admin/builders",
        label: "Builders",
        requires: "builders.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M9 21v-6h6v6" />
          </svg>
        ),
      },
```

- [ ] **Step 3: Typecheck, lint, build**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint && npm run build
```
Expected: type check clean, lint clean, `next build` succeeds and lists `/admin/builders` in the route output.

- [ ] **Step 4: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
git add "app/(app)/admin/builders/page.tsx" components/nav.tsx
git commit -m "feat(ui): add /admin/builders onboarding page and nav entry"
```

---

## Task 6: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** exercises the full chain Browser → BFF → backoffice → dpm-api with a real session cookie (the only path that covers the backoffice RBAC gate).

- [ ] **Step 1: Ensure services are current**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
.bin/devtool status
```
Expected: `dpm-api` and `backoffice` both running (rebuilt in Tasks 1 & 3).

- [ ] **Step 2: Start the Next dev server**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npm run dev
```
Expected: dev server on `http://localhost:3000`.

- [ ] **Step 3: Drive the UI (log in as root or a role with `builders.manage`)**

- Navigate to `http://localhost:3000/admin/builders`. The "Builders" link appears in the Admin nav group.
- In "Onboard builder", enter a **unique** name and wallet public key (do not reuse `cmqwg0iu…` if a prior `curl` already created it — it would 409), the Privy secret, and optionally the PEM verification key.
- Submit. Expected: the onboarding panel shows `api_public_key` (prefix `pk_builder_…`) with a working Copy button; the form clears; the new builder appears as the top row of the table.
- Type part of the name into "Search name". Expected: the list filters to the match.

- [ ] **Step 4: Confirm no secret leakage**

In the browser devtools Network tab, inspect the `GET /api/admin/builders` response. Expected: rows contain only `id, name, wallet_type, wallet_public_key, created_at, updated_at` — no `wallet_secret_key`, no `api_public_key`.

- [ ] **Step 5: Confirm the audit trail**

Navigate to `/access/audit` (or `GET /api/.../audit`). Expected: a mutation entry for the builder creation, attributed to the logged-in actor (audit is inherited from the backoffice route group).

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- dpm-api `GET /builders` list → Task 1. (`POST /builders` unchanged, per spec.)
- backoffice proxy `ListBuilders`/`CreateBuilder` → Task 3.
- `builders.{read,manage}` permissions + catalog → Task 2. (Preset-role change dropped: no preset role grants LP permissions today, so builders mirror LP as catalog-only, grantable via custom roles / root. This corrects the spec's initial "grant in preset role" note.)
- `lib/api.ts` types + `builders` client → Task 4.
- BFF `/api/admin/builders` route → Task 4.
- UI page (create form, onboarding panel, list w/ search + pagination) → Task 5.
- Nav entry → Task 5.
- Testing (dpm-api unit, authz unit, manual e2e) → Tasks 1, 2, 6.

**Placeholder scan:** none — every code step contains complete code; every command has an expected result.

**Type consistency:** `BuilderRow` / `CreateBuilderInput` / `CreateBuilderResult` (Task 4) are used identically in Task 5. `builderSearchFilters` (Task 1) and `ListBuilders`/`CreateBuilder` proxy method names (Task 3) match their `server.go` registrations. Permission constants `BuildersRead`/`BuildersManage` (Task 2) match their use in Task 3. dpm-api response keys (`data/total/limit/offset/total_pages`) match `Paginated<T>` consumed by `builders.list`.

---

# Addendum (2026-07-15): reveal a builder's API key in the list table

User follow-up after e2e: surface each builder's active `api_public_key` in the `/admin/builders` list, masked by default behind a **Reveal** button (+ copy), mirroring how the Liquidity-Providers table shows its key. The key is a plaintext public key stored in `builder_api_keys` (no decryption needed); it travels only in the admin-only, session-authed list response (GETs are not audited).

## Task 7: dpm-api — include active `api_public_key` in the builders list

**Files:**
- Modify: `prediction-go/apps/dpm-api/handlers/types.go` (add field to `BuilderPublicResponse`)
- Modify: `prediction-go/apps/dpm-api/handlers/builder.go` (`activeBuilderKeyFromEdges` helper + eager-load in `ListBuilders`)
- Test: `prediction-go/apps/dpm-api/handlers/builder_test.go` (pure test for the helper)

**Interfaces:**
- Consumes: `ent.Builder.Edges.BuilderAPIKeys []*ent.BuilderApiKey`, `builderapikey.StatusEQ`, `builderapikey.StatusActive` (already imported in builder.go), `BuilderQuery.WithBuilderAPIKeys(func(*ent.BuilderApiKeyQuery))`.
- Produces: `GET /builders` list rows gain `api_public_key` (active key's public key; omitted when none active).

- [ ] **Step 1: Write the failing test** — append to `builder_test.go`:

```go
func TestActiveBuilderKeyFromEdges(t *testing.T) {
	b := &ent.Builder{}
	b.Edges.BuilderAPIKeys = []*ent.BuilderApiKey{
		{PublicKey: "pk_revoked", Status: builderapikey.StatusRevoked},
		{PublicKey: "pk_active", Status: builderapikey.StatusActive},
	}
	k := activeBuilderKeyFromEdges(b)
	if k == nil || k.PublicKey != "pk_active" {
		t.Fatalf("want active key pk_active, got %#v", k)
	}

	none := &ent.Builder{}
	if activeBuilderKeyFromEdges(none) != nil {
		t.Error("want nil when no keys are loaded")
	}
}
```

Add the imports the test needs to the existing test file's import block: `"github.com/In-a-bit/prediction-go/libs/db/ent"` and `"github.com/In-a-bit/prediction-go/libs/db/ent/builderapikey"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./apps/dpm-api/handlers/ -run TestActiveBuilderKeyFromEdges`
Expected: FAIL — `undefined: activeBuilderKeyFromEdges`.

- [ ] **Step 3: Add the response field** — in `apps/dpm-api/handlers/types.go`, add to `BuilderPublicResponse` (after `WalletPublicKey`):

```go
	APIPublicKey    string    `json:"api_public_key,omitempty"`
```

- [ ] **Step 4: Add the helper + eager-load** — in `apps/dpm-api/handlers/builder.go`, add the helper:

```go
// activeBuilderKeyFromEdges returns the builder's single active API key from the
// eager-loaded edge, or nil when none is active. It re-checks status per row so
// a revoked key can never leak into a response even if the edge filter changes.
func activeBuilderKeyFromEdges(b *ent.Builder) *ent.BuilderApiKey {
	for _, k := range b.Edges.BuilderAPIKeys {
		if k.Status == builderapikey.StatusActive {
			return k
		}
	}
	return nil
}
```

Then in `ListBuilders`, add the eager-load to the query (right after `.Where(filters...)` on the list query, before `.Order(...)`):

```go
		WithBuilderAPIKeys(func(q *ent.BuilderApiKeyQuery) {
			q.Where(builderapikey.StatusEQ(builderapikey.StatusActive))
		}).
```

And populate the field in the row loop — replace the existing `rows = append(rows, BuilderPublicFromEnt(b))` with:

```go
		row := BuilderPublicFromEnt(b)
		if k := activeBuilderKeyFromEdges(b); k != nil {
			row.APIPublicKey = k.PublicKey
		}
		rows = append(rows, row)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && go test ./apps/dpm-api/handlers/ -run 'TestActiveBuilderKeyFromEdges|TestBuilderSearchFilters'`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `cd /home/yuvala/Documents/prediction-claude/prediction-go && go build ./apps/dpm-api/...`
Expected: succeeds. (Runtime rebuild/smoke deferred as before.)

- [ ] **Step 7: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-go
git add apps/dpm-api/handlers/types.go apps/dpm-api/handlers/builder.go apps/dpm-api/handlers/builder_test.go
git commit -m "feat(dpm-api): include active api_public_key in builders list"
```

## Task 8: UI — reveal/copy the API key column in the builders table

**Files:**
- Modify: `prediction-backoffice/lib/api.ts` (`BuilderRow` gains `api_public_key?`)
- Modify: `prediction-backoffice/app/(app)/admin/builders/page.tsx` (new column + reveal/copy)

**Interfaces:**
- Consumes: `BuilderRow.api_public_key?: string` from the extended list response (Task 7).

- [ ] **Step 1: Extend the type** — in `lib/api.ts`, add to `BuilderRow` (after `wallet_public_key`):

```ts
  api_public_key?: string;
```

- [ ] **Step 2: Add reveal + copy state** — in `page.tsx`, add alongside the other list state (near `const [error, setError] = useState("");`):

```tsx
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<number | null>(null);
```

And add a row-copy helper next to `copyKey`:

```tsx
  async function copyRowKey(key: string, rowId: number) {
    await navigator.clipboard.writeText(key);
    setCopiedRowId(rowId);
    setTimeout(() => setCopiedRowId((id) => (id === rowId ? null : id)), 1500);
  }
```

- [ ] **Step 3: Add the column** — in the table header, add an `API key` `<th>` after the `Wallet public key` header:

```tsx
                  <th className="py-2 pr-3">API key</th>
```

In the data row, add this `<td>` after the wallet-public-key cell (and update the two `colSpan={4}` placeholder rows — loading and empty — to `colSpan={5}`):

```tsx
                      <td className="py-3 pr-3">
                        {!row.api_public_key ? (
                          <span className="text-xs text-foreground-muted">—</span>
                        ) : revealedId === row.id ? (
                          <div className="flex items-center gap-2">
                            <code className="text-xs break-all">{row.api_public_key}</code>
                            <button
                              type="button"
                              className={buttonVariants.secondary}
                              onClick={() => copyRowKey(row.api_public_key ?? "", row.id)}
                            >
                              {copiedRowId === row.id ? "Copied" : "Copy"}
                            </button>
                            <button
                              type="button"
                              className={buttonVariants.secondary}
                              onClick={() => setRevealedId(null)}
                            >
                              Hide
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={buttonVariants.secondary}
                            onClick={() => setRevealedId(row.id)}
                          >
                            Reveal
                          </button>
                        )}
                      </td>
```

- [ ] **Step 4: Verify** — `cd /home/yuvala/Documents/prediction-claude/prediction-backoffice && npx tsc --noEmit && npm run lint`. Expected clean for the touched files. (`next build` folds into the runtime pass.)

- [ ] **Step 5: Commit**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
git add lib/api.ts "app/(app)/admin/builders/page.tsx"
git commit -m "feat(ui): reveal/copy a builder's API key in the list table"
```
