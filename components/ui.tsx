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

// ----- Form primitives -----

export const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-muted/70 focus:outline-none focus:border-accent";

export const selectClass = inputClass;

export const textareaClass = `${inputClass} font-mono text-xs leading-relaxed`;

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-foreground-muted flex items-center gap-1"
      >
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </label>
      {children}
      {hint ? (
        <span className="text-[11px] text-foreground-muted">{hint}</span>
      ) : null}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}

export function BoolSelect({
  value,
  onChange,
  id,
  allowUnset = true,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  id?: string;
  allowUnset?: boolean;
}) {
  // Triple-state ("", "true", "false") so the operator can distinguish
  // "unset → server default" from explicit true/false. The dpm-api uses
  // pointer fields with defaults when omitted.
  const v = value === undefined ? "" : value ? "true" : "false";
  return (
    <select
      id={id}
      className={selectClass}
      value={v}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "") onChange(undefined);
        else onChange(next === "true");
      }}
    >
      {allowUnset ? <option value="">— default —</option> : null}
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
}

export function JsonField({
  value,
  onChange,
  id,
  rows = 6,
  placeholder = "{}",
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <textarea
      id={id}
      className={`${textareaClass} ${invalid ? "border-danger" : ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      spellCheck={false}
    />
  );
}

export function AdvancedCollapse({
  children,
  summary = "Advanced fields",
  defaultOpen = false,
}: {
  children: ReactNode;
  summary?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-md border border-border bg-foreground/[0.02]"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted flex items-center justify-between">
        <span>{summary}</span>
        <span className="transition-transform group-open:rotate-90 text-foreground-muted">
          ▸
        </span>
      </summary>
      <div className="px-4 py-4 border-t border-border space-y-3">
        {children}
      </div>
    </details>
  );
}

// Section header inside a card body — visually groups a related set of fields.
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mt-1 mb-2">
      {children}
    </h3>
  );
}
