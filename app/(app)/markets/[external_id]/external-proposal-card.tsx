import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { formatDateTimeFull } from "@/lib/format";
import {
  CREATE_METHOD_LABEL,
  type ExternalProposalView,
  type PolymarketReference,
} from "@/lib/types";

// Canonical UMA price encodings the adapter passes through to the oracle. The
// proposed price is what the operator is being asked to accept or challenge, so
// it is labelled rather than shown as raw wei.
const PROPOSED_PRICE_LABEL: Record<string, string> = {
  "0": "NO",
  "1000000000000000000": "YES",
  "500000000000000000": "50/50 (unknown)",
};

/**
 * The operator's decision surface for a proposal that arrived from outside our
 * system. The accept/dispute buttons live in the Actions panel; this card is
 * the evidence they need to choose — who proposed what, by when they must
 * answer, and how Polymarket resolved the same question when the market came
 * from a Polymarket slug.
 */
export function ExternalProposalCard({ view }: { view: ExternalProposalView }) {
  if (!view.has_external_proposal && !view.has_external_dispute) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
            External proposal
          </h2>
          {view.has_external_proposal ? (
            <Badge tone="warning">proposal</Badge>
          ) : null}
          {view.has_external_dispute ? (
            <Badge tone="danger">dispute</Badge>
          ) : null}
          <Badge tone="neutral">{CREATE_METHOD_LABEL[view.create_method]}</Badge>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <DecisionBanner view={view} />

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Fact label="proposed answer" value={proposedAnswer(view.proposed_price)} />
          <Fact label="proposer" value={view.proposer} mono />
          <Fact
            label="liveness ends"
            value={view.expires_at ? formatDateTimeFull(view.expires_at) : undefined}
          />
          <Fact
            label="decide by"
            value={view.dispute_by ? formatDateTimeFull(view.dispute_by) : undefined}
          />
          <Fact label="uma_resolution_status" value={view.uma_resolution_status} />
          <Fact label="local_status" value={view.local_status} />
        </dl>

        {view.polymarket ? (
          <PolymarketBlock reference={view.polymarket} />
        ) : view.create_method === "polymarket_slug" ? (
          <p className="text-[11px] text-foreground-muted">
            Polymarket reference not fetched yet — the resolution workflow
            enriches it shortly after detecting the proposal.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

// Spells out what happens next, which differs sharply by decision state: an
// undecided proposal will be disputed automatically at the deadline, so silence
// is itself a choice the operator should make knowingly.
function DecisionBanner({ view }: { view: ExternalProposalView }) {
  if (view.decision === "accepted") {
    return (
      <Banner tone="success" title="Accepted by an operator">
        The resolution workflow waits out the liveness window and then resolves
        this market on the proposed answer.
        <Attribution view={view} />
      </Banner>
    );
  }
  if (view.decision === "disputed") {
    return (
      <Banner tone="danger" title="Disputed by an operator">
        The dispute was sent on-chain. A first dispute resets the question for a
        new proposal; a second hands the outcome to the UMA DVM.
        <Attribution view={view} />
      </Banner>
    );
  }
  return (
    <Banner tone="warning" title="Awaiting an operator decision">
      Accept to let the proposed answer settle, or dispute to challenge it. If
      nobody decides by{" "}
      {view.dispute_by ? formatDateTimeFull(view.dispute_by) : "the deadline"},
      the resolution workflow disputes automatically — an unverified answer is
      never allowed to settle.
    </Banner>
  );
}

function Attribution({ view }: { view: ExternalProposalView }) {
  if (!view.decided_by && !view.decided_at) return null;
  return (
    <span className="block mt-1 text-foreground-muted">
      {view.decided_by ?? "unknown"}
      {view.decided_at ? ` · ${formatDateTimeFull(view.decided_at)}` : ""}
    </span>
  );
}

function PolymarketBlock({ reference }: { reference: PolymarketReference }) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
          On Polymarket
        </span>
        <Badge tone={reference.resolved ? "success" : "neutral"}>
          {reference.resolved
            ? `resolved: ${reference.resolved_outcome ?? "no single winner"}`
            : "unresolved"}
        </Badge>
      </div>
      {reference.question ? (
        <p className="text-xs">{reference.question}</p>
      ) : null}
      {reference.polymarket_url ? (
        <a
          href={reference.polymarket_url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-accent hover:underline break-all"
        >
          {reference.polymarket_url}
        </a>
      ) : null}
      <p className="text-[10px] text-foreground-muted">
        fetched {formatDateTimeFull(reference.fetched_at)}
      </p>
    </div>
  );
}

function proposedAnswer(price?: string): string | undefined {
  if (!price) return undefined;
  const label = PROPOSED_PRICE_LABEL[price];
  return label ? `${label} (${price})` : price;
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-foreground-muted">
        {label}
      </dt>
      <dd className={`text-foreground ${mono ? "font-mono break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "success" | "warning" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "danger"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-warning/30 bg-warning/10 text-warning";
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 ${toneClass}`}>
      <p className="text-xs font-semibold leading-tight">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug opacity-80">{children}</p>
    </div>
  );
}
