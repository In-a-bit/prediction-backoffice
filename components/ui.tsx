import { ReactNode } from "react";

// ----- Page header -----

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-foreground-muted text-sm mt-1 max-w-2xl">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

// ----- Card -----

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface border border-border rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-5 py-4 border-b border-border ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

// ----- Badge -----

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const badgeTones: Record<BadgeTone, string> = {
  neutral:
    "bg-foreground/5 text-foreground-muted border-border",
  success:
    "bg-success/10 text-success border-success/20 dark:bg-success/15",
  warning:
    "bg-warning/10 text-warning border-warning/20 dark:bg-warning/15",
  danger:
    "bg-danger/10 text-danger border-danger/20 dark:bg-danger/15",
  info: "bg-info/10 text-info border-info/20 dark:bg-info/15",
  accent: "bg-accent/10 text-accent border-accent/20 dark:bg-accent/20",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

// ----- Stat -----

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: BadgeTone;
}) {
  const valueColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : tone === "info"
            ? "text-info"
            : tone === "accent"
              ? "text-accent"
              : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
        {label}
      </span>
      <span className={`text-xl font-semibold ${valueColor} tabular-nums`}>
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-foreground-muted">{hint}</span>
      ) : null}
    </div>
  );
}

// ----- Empty state -----

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <p className="text-base font-medium">{title}</p>
      {description ? (
        <p className="text-sm text-foreground-muted mt-1 max-w-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ----- Buttons -----

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const buttonVariants = {
  primary: `${buttonBase} bg-accent text-accent-foreground hover:opacity-90`,
  secondary: `${buttonBase} bg-foreground/5 text-foreground hover:bg-foreground/10 border border-border`,
  ghost: `${buttonBase} text-foreground-muted hover:text-foreground hover:bg-foreground/5`,
  danger: `${buttonBase} bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15`,
};

// ----- Inline error / success -----

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
      {children}
    </div>
  );
}

export function InfoMessage({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm text-foreground-muted bg-foreground/5 border border-border rounded-md px-3 py-2">
      {children}
    </div>
  );
}
