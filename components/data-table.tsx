"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/ui";

// Generic, opinionated TanStack Table wrapper used by the rebuilt /events,
// /markets, /resolutions, and /operations/alerts pages. The styling matches
// the existing Card/Badge primitives so tables drop into Card bodies without
// fighting the design system. Column-level filters are wired through but the
// caller chooses where to render the filter inputs (usually a row of pills
// above the table — see ComboSearch + Tabs in /events for an example).

export type DataTableProps<TData, TValue> = {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  // Optional global text filter, matched case-insensitively against the
  // string-coerced value of every leaf cell.
  globalFilter?: string;
  // Initial sorting (override per-table).
  initialSorting?: SortingState;
  // Per-column filter values controlled from outside the table.
  columnFilters?: ColumnFiltersState;
  // Optional per-row link/action — caller provides; the table renders a
  // chevron at the row end and adds cursor-pointer styling.
  getRowHref?: (row: TData) => string | undefined;
  pageSize?: number;
  emptyState?: { title: string; description?: string };
  className?: string;
  // Render-prop slot for footer summary (e.g., "12 of 42 markets").
  footer?: (ctx: { totalRows: number; visibleRows: number }) => ReactNode;
};

export function DataTable<TData, TValue>({
  data,
  columns,
  globalFilter,
  initialSorting,
  columnFilters,
  getRowHref,
  pageSize = 25,
  emptyState,
  className = "",
  footer,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  // useReactTable only re-creates instance when `columns` or `data` change.
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const totalRows = data.length;
  const visibleRows = table.getFilteredRowModel().rows.length;

  const rows = table.getRowModel().rows;
  const isEmpty = visibleRows === 0;

  // Stable column count for empty/loading rows. Memo because we read it on
  // each render even though it doesn't change inside the table instance.
  const columnCount = useMemo(() => columns.length + (getRowHref ? 1 : 0), [columns, getRowHref]);

  return (
    <div className={`w-full ${className}`}>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.02] text-foreground-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sort = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className="text-left font-medium text-[11px] uppercase tracking-wider px-4 py-2.5 whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          disabled={!canSort}
                          className={`inline-flex items-center gap-1 ${
                            canSort
                              ? "cursor-pointer hover:text-foreground transition-colors"
                              : "cursor-default"
                          }`}
                          aria-sort={
                            sort === "asc"
                              ? "ascending"
                              : sort === "desc"
                                ? "descending"
                                : "none"
                          }
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort ? (
                            <SortIcon dir={sort === false ? null : sort} />
                          ) : null}
                        </button>
                      )}
                    </th>
                  );
                })}
                {getRowHref ? <th className="w-10" aria-hidden /> : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  <EmptyState
                    title={emptyState?.title ?? "No rows"}
                    description={emptyState?.description}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = getRowHref?.(row.original);
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-border transition-colors hover:bg-foreground/[0.025] ${
                      href ? "cursor-pointer" : ""
                    }`}
                    onClick={
                      href
                        ? (e) => {
                            // Allow inner links/buttons to swallow the click.
                            if ((e.target as HTMLElement).closest("a, button")) return;
                            window.location.href = href;
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {getRowHref ? (
                      <td className="px-4 py-3 text-foreground-muted">
                        <ChevronRight />
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!isEmpty && totalRows > pageSize ? (
        <Pagination table={table} />
      ) : null}
      {footer ? (
        <div className="flex items-center justify-between mt-2 text-xs text-foreground-muted">
          {footer({ totalRows, visibleRows })}
        </div>
      ) : null}
    </div>
  );
}

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-opacity ${dir ? "opacity-100" : "opacity-30"}`}
    >
      {dir === "asc" ? (
        <path d="M7 14l5-5 5 5" />
      ) : dir === "desc" ? (
        <path d="M7 10l5 5 5-5" />
      ) : (
        <>
          <path d="M7 10l5-5 5 5" />
          <path d="M7 14l5 5 5-5" />
        </>
      )}
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Pagination — simple prev/next + page indicator. Hidden when total <= pageSize.
function Pagination<TData>({ table }: { table: ReturnType<typeof useReactTable<TData>> }) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  return (
    <div className="flex items-center justify-end gap-2 mt-3 text-xs text-foreground-muted">
      <button
        type="button"
        className="px-2 py-1 rounded-md border border-border hover:bg-foreground/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
      >
        Prev
      </button>
      <span className="tabular-nums">
        {pageIndex + 1} / {Math.max(pageCount, 1)}
      </span>
      <button
        type="button"
        className="px-2 py-1 rounded-md border border-border hover:bg-foreground/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
      >
        Next
      </button>
    </div>
  );
}
