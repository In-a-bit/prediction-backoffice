"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  Field,
  buttonVariants,
} from "@/components/ui";
import {
  TagChipsEditor,
  slugify,
  suggestSoccerTags,
} from "@/components/sports/tag-chips";
import { isLivenessValidationError, readFetchErrorMessage } from "@/lib/api-error";
import type {
  ApiFootballLeagueSearchResult,
  SportTask,
  SportsTagSpec,
} from "@/lib/types";

const MARKET_TYPES = [
  {
    key: "moneyline",
    label: "Moneyline (regulation)",
    note:
      "3 Yes/No markets per fixture (home wins, draw, away wins). Resolved on score.fulltime — extra time and penalty shootouts count as a draw.",
  },
  {
    key: "halftime",
    label: "Halftime",
    note:
      "3 Yes/No markets per fixture for the halftime score. Resolves as soon as the fixture reaches HT (status >= HT).",
  },
] as const;

const currentYear = new Date().getUTCFullYear();
// api-football uses a single calendar year as the season identifier.
// Default to the current calendar year.
const defaultSeason = currentYear;

// availableSeasons returns a sensible list of seasons for the dropdown:
// 3 years back through 1 year forward from the current calendar year.
function availableSeasons(): number[] {
  const years: number[] = [];
  for (let y = currentYear + 1; y >= currentYear - 3; y--) {
    years.push(y);
  }
  return years;
}

// LeagueOption is the per-row payload the dropdown renders. `disabled` is set
// for (api_league_id, api_season) combinations that already have a config —
// we still show them so operators see what's been configured, but they can't
// be re-selected.
type LeagueOption = ApiFootballLeagueSearchResult & {
  disabled: boolean;
  disabledReason?: string;
  existingConfigId?: number;
};

export function NewSportTaskForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [season, setSeason] = useState<number>(defaultSeason);
  const [allLeagues, setAllLeagues] = useState<ApiFootballLeagueSearchResult[]>([]);
  const [existingConfigs, setExistingConfigs] = useState<SportTask[]>([]);
  // Default to true so the "0 leagues" warning doesn't flash before the
  // first fetch starts (initial render → useEffect fires → setLoadingLeagues(true)
  // had a one-frame gap that made the page look broken).
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");

  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [leagueSlug, setLeagueSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [timeAheadHours, setTimeAheadHours] = useState<number>(72);
  const [liveness, setLiveness] = useState<string>("");
  const [parallelPlans, setParallelPlans] = useState<number>(1);
  const [maxPausedPlans, setMaxPausedPlans] = useState<number>(10);
  const [tags, setTags] = useState<SportsTagSpec[]>([]);
  const [tagsEdited, setTagsEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [marketTypes, setMarketTypes] = useState<string[]>(["moneyline"]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [livenessError, setLivenessError] = useState<string | null>(null);

  // Fetch leagues + existing configs whenever the season changes. The
  // leagues call is a large payload (~1000 rows) but server-side cached.
  // 20s hard timeout via AbortController so the form doesn't hang silently
  // when the Go backoffice is down (the route handler proxies blocking).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const load = async () => {
      setLoadingLeagues(true);
      setLeagueError(null);
      try {
        const [leaguesRes, configsRes] = await Promise.all([
          fetch(`/api/sports/leagues/all?season=${season}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/sports/tasks?sport_key=soccer`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (cancelled) return;
        if (!leaguesRes.ok) {
          // Surface the actual upstream error body so 500/502/etc. don't look
          // like an empty success. Common causes: Go backoffice not restarted
          // (route 404), api-football key invalid (403), rate-limit (429).
          const text = await leaguesRes.text().catch(() => "");
          setLeagueError(`leagues fetch failed — status ${leaguesRes.status}: ${text || "(empty body)"}`);
          setAllLeagues([]);
        } else {
          const data = (await leaguesRes.json()) as ApiFootballLeagueSearchResult[] | null;
          // Defensive: a misbehaving upstream could return null.
          setAllLeagues(Array.isArray(data) ? data : []);
        }
        if (!configsRes.ok) {
          // Don't block the form, just log — operators can still create a new config.
          console.warn(`existing configs fetch failed: status ${configsRes.status}`);
          setExistingConfigs([]);
        } else {
          const data = (await configsRes.json()) as SportTask[] | null;
          setExistingConfigs(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          // AbortError from the timeout has a generic message — replace
          // with the actual diagnosis so operators don't chase a phantom.
          const friendly = msg.includes("abort")
            ? "fetch timed out after 20s — the Go backoffice (BACKOFFICE_API_URL) is likely not reachable. Confirm `go run ./cmd` is up on the configured port."
            : `leagues fetch threw: ${msg}`;
          setLeagueError(friendly);
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoadingLeagues(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [season]);

  // Distinct list of countries in the loaded leagues — used to populate the
  // country dropdown. Sorted alphabetically; "" represents "all countries".
  const countries: string[] = useMemo(() => {
    const set = new Set<string>();
    for (const lg of allLeagues) {
      if (lg.country) set.add(lg.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allLeagues]);

  // Build the dropdown universe: every league for this season, with
  // already-configured ones flagged disabled. Sorted by country, then name.
  // Country filter is an exact match (so "England" doesn't surface
  // "Northern Ireland" etc.); text filter is a substring across name+id.
  const options: LeagueOption[] = useMemo(() => {
    const existingForSeason = new Map<number, SportTask>();
    for (const cfg of existingConfigs) {
      if (cfg.api_season === season) {
        existingForSeason.set(cfg.api_league_id, cfg);
      }
    }
    let rows: LeagueOption[] = allLeagues.map((lg) => {
      const existing = existingForSeason.get(lg.id);
      return {
        ...lg,
        disabled: Boolean(existing),
        disabledReason: existing ? "already configured" : undefined,
        existingConfigId: existing?.id,
      };
    });
    if (countryFilter) {
      rows = rows.filter((r) => (r.country ?? "") === countryFilter);
    }
    rows.sort((a, b) => {
      const c = (a.country ?? "").localeCompare(b.country ?? "");
      if (c !== 0) return c;
      return a.name.localeCompare(b.name);
    });
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.country ?? "").toLowerCase().includes(needle) ||
        String(r.id).includes(needle),
    );
  }, [allLeagues, existingConfigs, filter, countryFilter, season]);

  const selectedLeague = useMemo(
    () => allLeagues.find((l) => l.id === selectedLeagueId) ?? null,
    [allLeagues, selectedLeagueId],
  );

  const onSelectLeague = (lg: LeagueOption) => {
    if (lg.disabled) return;
    setSelectedLeagueId(lg.id);
  };

  // Auto-derive league_slug = "{kebab(name)}-{year}" whenever the league or
  // season changes, unless the operator has manually edited the slug. We
  // append the year only if the base slug doesn't already include it — per
  // the rule "if the api returns a slug use it; if it's missing the year,
  // concat it" (api-football doesn't currently return a slug, but the rule
  // covers a future where it might).
  useEffect(() => {
    if (slugEdited) return;
    if (!selectedLeague) {
      setLeagueSlug("");
      return;
    }
    const base = slugify(selectedLeague.name) || `league-${selectedLeague.id}`;
    const yearSuffix = `-${season}`;
    const next = base.endsWith(yearSuffix) ? base : `${base}${yearSuffix}`;
    setLeagueSlug(next);
  }, [selectedLeague, season, slugEdited]);

  // Auto-seed the tag chips whenever the league or season changes, unless
  // the operator has touched them. Always reflects current selection.
  useEffect(() => {
    if (tagsEdited) return;
    if (!selectedLeague) {
      setTags([]);
      return;
    }
    setTags(
      suggestSoccerTags({
        leagueName: selectedLeague.name,
        country: selectedLeague.country,
        season,
      }),
    );
  }, [selectedLeague, season, tagsEdited]);

  const toggleMarketType = (key: string) => {
    setMarketTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const canSubmit =
    selectedLeague !== null &&
    leagueSlug.trim().length > 0 &&
    timeAheadHours > 0 &&
    marketTypes.length > 0;

  const onSubmit = () => {
    if (!canSubmit || !selectedLeague) return;
    setSubmitError(null);
    setLivenessError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sports/tasks/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sport_key: "soccer",
            api_league_id: selectedLeague.id,
            api_season: season,
            league_slug: leagueSlug,
            time_ahead_hours: timeAheadHours,
            tag_specs: tags, // backend upserts these via dpm-api
            category: category || undefined,
            sub_category: subCategory || undefined,
            market_type_keys: marketTypes,
            auto_start_plans: autoStart,
            liveness: liveness !== "" ? parseInt(liveness, 10) : undefined,
            parallel_plans: parallelPlans,
            max_paused_plans: maxPausedPlans,
          }),
        });
        if (!res.ok) {
          const message = await readFetchErrorMessage(res);
          if (isLivenessValidationError(message)) {
            setLivenessError(message);
          } else {
            setSubmitError(message);
          }
          return;
        }
        const created = (await res.json()) as { id: number };
        router.push(`/automations/sports/soccer/${created.id}`);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. League dropdown */}
      <Card>
        <CardHeader>
          <span className="font-semibold">1. Pick a league</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <Field
              label="Season"
              hint={`Default ${defaultSeason} (current year). api-football uses a single year as the season identifier.`}
            >
              <select
                className="border rounded px-3 py-2 w-40"
                value={season}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n)) return;
                  setSeason(n);
                  setSelectedLeagueId(null);
                  setCountryFilter("");
                }}
              >
                {availableSeasons().map((y) => (
                  <option key={y} value={y}>
                    {y}
                    {y === defaultSeason ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country" hint="Exact match — narrows the dropdown to one country.">
              <select
                className="border rounded px-3 py-2 w-56"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
              >
                <option value="">All countries ({countries.length})</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex-1 min-w-48">
            <Field label="Filter (name, id)">
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder="premier, 39…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </Field>
            </div>
            <div className="text-xs text-foreground-muted pb-2">
              {loadingLeagues
                ? "loading…"
                : `${options.length} of ${allLeagues.length} leagues`}
            </div>
          </div>

          {leagueError && <ErrorMessage>{leagueError}</ErrorMessage>}

          {!loadingLeagues && allLeagues.length === 0 && !leagueError && (
            <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              api-football returned 0 leagues for season <strong>{season}</strong>.
              That season probably isn't populated yet — try{" "}
              <strong>{defaultSeason}</strong> instead. (If you don't see {" "}
              <code>APIFOOTBALL_API_KEY</code> errors in the backoffice logs, this is the most
              likely cause.)
            </div>
          )}

          <div className="border rounded max-h-96 overflow-y-auto">
            {options.length === 0 && !loadingLeagues && allLeagues.length > 0 && (
              <div className="px-3 py-4 text-sm text-foreground-muted">
                No leagues match. Clear the filter or change the country.
              </div>
            )}
            <ul className="divide-y">
              {options.map((lg) => {
                const isSelected = selectedLeagueId === lg.id;
                return (
                  <li key={`${lg.id}-${lg.country}`}>
                    <button
                      type="button"
                      onClick={() => onSelectLeague(lg)}
                      disabled={lg.disabled}
                      className={`flex items-center gap-3 px-3 py-2 w-full text-left transition-colors ${
                        lg.disabled
                          ? "opacity-50 cursor-not-allowed"
                          : isSelected
                            ? "bg-accent-soft"
                            : "hover:bg-surface-hover"
                      }`}
                    >
                      {lg.logo && (
                        <img src={lg.logo} alt="" className="h-6 w-6 object-contain flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{lg.name}</div>
                        <div className="text-xs text-foreground-muted truncate">
                          {lg.country} · id {lg.id} · {lg.type}
                        </div>
                      </div>
                      {lg.disabled ? (
                        <Badge tone="neutral">{lg.disabledReason}</Badge>
                      ) : isSelected ? (
                        <Badge tone="success">selected</Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </CardBody>
      </Card>

      {/* 2. Market types */}
      <Card>
        <CardHeader>
          <span className="font-semibold">2. Market behaviors</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {MARKET_TYPES.map((mt) => (
            <label key={mt.key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={marketTypes.includes(mt.key)}
                onChange={() => toggleMarketType(mt.key)}
              />
              <div>
                <div className="font-medium text-sm">{mt.label}</div>
                <div className="text-xs text-foreground-muted">{mt.note}</div>
              </div>
            </label>
          ))}
        </CardBody>
      </Card>

      {/* 3. Operational config */}
      <Card>
        <CardHeader>
          <span className="font-semibold">3. Operational config</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field
            label="League slug"
            hint={`Auto-derived from the selected league + season (kebab-case name with year suffix). Used as the dpm-api series slug${slugEdited ? " — manually edited" : ""}.`}
          >
            <div className="flex items-center gap-2">
              <input
                className="border rounded px-3 py-2 flex-1 font-mono text-sm"
                value={leagueSlug}
                onChange={(e) => {
                  setLeagueSlug(e.target.value);
                  setSlugEdited(true);
                }}
                placeholder="premier-league-2025"
              />
              {slugEdited && (
                <button
                  type="button"
                  className={`${buttonVariants.ghost} text-xs`}
                  onClick={() => setSlugEdited(false)}
                  title="Re-derive slug from the selected league + season"
                >
                  Reset to auto
                </button>
              )}
            </div>
          </Field>

          <Field
            label="Time ahead (hours)"
            hint="How far in advance of kickoff to create fixture events + markets."
          >
            <input
              type="number"
              className="border rounded px-3 py-2 w-32"
              value={timeAheadHours}
              onChange={(e) => setTimeAheadHours(parseInt(e.target.value || "0", 10))}
            />
          </Field>

          <Field
            label="UMA liveness"
            hint="How long (in seconds) UMA's Optimistic Oracle waits before a proposal can be resolved. Leave blank to use the global default (7200 s = 2 h)."
            error={livenessError}
          >
            <input
              type="number"
              className="border rounded px-3 py-2 w-40"
              placeholder="7200 (default)"
              value={liveness}
              min={1}
              onChange={(e) => {
                setLiveness(e.target.value);
                if (livenessError) setLivenessError(null);
              }}
            />
          </Field>

          <Field
            label="Parallel plans"
            hint="Max number of deploy plans allowed in 'running' status simultaneously for this task. Default 1 keeps serial behaviour."
          >
            <input
              type="number"
              className="border rounded px-3 py-2 w-24"
              value={parallelPlans}
              min={1}
              onChange={(e) => setParallelPlans(parseInt(e.target.value || "1", 10))}
            />
          </Field>

          <Field
            label="Max paused plans"
            hint="When this many deploy plans are in 'paused' status, new plan creation is blocked until the count drops. Default 10."
          >
            <input
              type="number"
              className="border rounded px-3 py-2 w-24"
              value={maxPausedPlans}
              min={1}
              onChange={(e) => setMaxPausedPlans(parseInt(e.target.value || "1", 10))}
            />
          </Field>

          <Field
            label="Tags"
            hint={`Auto-seeded from the selected league: name, season, country, plus Soccer + Football${tagsEdited ? " — manually edited" : ""}. Unknown slugs are created in dpm-api on submit.`}
          >
            <div className="space-y-2">
              <TagChipsEditor
                value={tags}
                onChange={(next) => {
                  setTags(next);
                  setTagsEdited(true);
                }}
              />
              {tagsEdited && (
                <button
                  type="button"
                  className={`${buttonVariants.ghost} text-xs`}
                  onClick={() => setTagsEdited(false)}
                  title="Re-seed tags from the selected league + season"
                >
                  Reset to auto-seeded
                </button>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input
                className="border rounded px-3 py-2 w-full"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
            <Field label="Sub-category">
              <input
                className="border rounded px-3 py-2 w-full"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
            />
            <span className="text-sm">
              Auto-start DeployPlans (recommended). When off, every fixture's plan starts paused and
              waits for an operator click.
            </span>
          </label>
        </CardBody>
      </Card>

      {submitError && <ErrorMessage>{submitError}</ErrorMessage>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isPending}
          className={buttonVariants.primary}
        >
          {isPending ? "Creating…" : "Create league config"}
        </button>
        {!canSubmit && (
          <span className="text-xs text-foreground-muted">
            Pick a league, set a non-empty slug + positive time ahead, choose at least one market
            type.
          </span>
        )}
      </div>
    </div>
  );
}
