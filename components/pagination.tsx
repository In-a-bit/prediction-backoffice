"use client";

// Pagination bar. Page-number links use <Link> (server re-render on click);
// the rows-per-page <select> uses window.location for navigation.

import Link from "next/link";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type PaginationProps = {
  /** Total number of records on the server. */
  total: number;
  /** Current page (1-based). */
  page: number;
  /** Records per page. */
  perPage: number;
  /**
   * Base path for pagination links (e.g. "/automations/crypto-interval/42").
   * The component appends `?page=N&per_page=N` automatically.
   */
  basePath: string;
};

// Builds a URL by merging page/per_page into any existing query params on basePath.
// basePath may be a plain path ("/foo") or already carry other filters ("/foo?source=x").
function href(basePath: string, page: number, perPage: number) {
  const [path, qs] = basePath.split("?");
  const params = new URLSearchParams(qs ?? "");
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  return `${path}?${params.toString()}`;
}

export function Pagination({ total, page, perPage, basePath }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = Math.min((page - 1) * perPage + 1, total);
  const to = Math.min(page * perPage, total);

  const prev = page > 1 ? href(basePath, page - 1, perPage) : null;
  const next = page < totalPages ? href(basePath, page + 1, perPage) : null;

  // Show at most 7 page numbers with ellipsis compression.
  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-xs text-foreground-muted">
      {/* Summary */}
      <span className="tabular-nums">
        {total === 0 ? "No results" : `${from}–${to} of ${total.toLocaleString()}`}
      </span>

      <div className="flex items-center gap-3">
        {/* Rows-per-page */}
        <label className="flex items-center gap-1.5">
          Rows
          <select
            defaultValue={perPage}
            onChange={(e) => {
              window.location.href = href(basePath, 1, Number(e.target.value));
            }}
            className="px-1.5 py-0.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {/* Page numbers */}
        <nav className="flex items-center gap-0.5" aria-label="Pagination">
          <PaginationLink href={prev} label="‹" disabled={!prev} aria="Previous page" />

          {pageNumbers.map((entry, i) =>
            entry === "…" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable ellipsis positions
              <span key={`ellipsis-${i}`} className="px-2 py-1 text-foreground-muted select-none">
                …
              </span>
            ) : (
              <PaginationLink
                key={entry}
                href={href(basePath, entry as number, perPage)}
                label={String(entry)}
                active={(entry as number) === page}
                aria={`Page ${entry}`}
              />
            ),
          )}

          <PaginationLink href={next} label="›" disabled={!next} aria="Next page" />
        </nav>
      </div>
    </div>
  );
}

function PaginationLink({
  href,
  label,
  active,
  disabled,
  aria,
}: {
  href: string | null;
  label: string;
  active?: boolean;
  disabled?: boolean;
  aria: string;
}) {
  const base =
    "inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md text-xs font-medium transition-colors";

  if (disabled || !href) {
    return (
      <span
        aria-label={aria}
        aria-disabled
        className={`${base} text-foreground-muted/40 cursor-not-allowed`}
      >
        {label}
      </span>
    );
  }

  if (active) {
    return (
      <span
        aria-label={aria}
        aria-current="page"
        className={`${base} bg-accent text-accent-foreground cursor-default`}
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={aria}
      className={`${base} text-foreground hover:bg-foreground/5 cursor-pointer`}
    >
      {label}
    </Link>
  );
}

/** Produces a compact page-number list with "…" ellipsis for large ranges. */
function buildPageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: Array<number | "…"> = [];
  const addPage = (n: number) => {
    if (pages[pages.length - 1] !== n) pages.push(n);
  };

  addPage(1);
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    addPage(p);
  }
  if (current < total - 2) pages.push("…");
  addPage(total);

  return pages;
}
