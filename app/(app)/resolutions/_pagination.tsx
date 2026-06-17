import Link from "next/link";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  tab: string;
  q?: string;
  source?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  perPage,
  tab,
  q,
  source,
}: PaginationProps) {
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  function pageHref(p: number) {
    const sp = new URLSearchParams({ tab, page: String(p) });
    if (q) sp.set("q", q);
    if (source) sp.set("source", source);
    return `/resolutions?${sp.toString()}`;
  }

  const prevHref = page > 1 ? pageHref(page - 1) : null;
  const nextHref = page < totalPages ? pageHref(page + 1) : null;

  const buttonClass =
    "px-2 py-1 rounded-md border border-border text-xs text-foreground-muted hover:bg-foreground/5 transition-colors";
  const disabledClass =
    "px-2 py-1 rounded-md border border-border text-xs text-foreground-muted opacity-40 cursor-not-allowed";

  return (
    <div className="flex items-center justify-between gap-2 mt-1 pt-3 border-t border-border">
      <span className="text-xs text-foreground-muted tabular-nums">
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link href={prevHref} className={buttonClass}>
            Prev
          </Link>
        ) : (
          <span className={disabledClass}>Prev</span>
        )}
        <span className="text-xs text-foreground-muted tabular-nums">
          {page} / {totalPages}
        </span>
        {nextHref ? (
          <Link href={nextHref} className={buttonClass}>
            Next
          </Link>
        ) : (
          <span className={disabledClass}>Next</span>
        )}
      </div>
    </div>
  );
}
