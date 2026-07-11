import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpenText,
  BrainCircuit,
  CircleHelp,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FlaskConical,
  KeyRound,
  Leaf,
  MessageSquareText,
  Microscope,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  X
} from "lucide-react";
import seedbankWorkbench from "../assets/branding/seedbank-workbench.png";
import appIcon from "../assets/branding/app-icon.svg";
import psuSignature from "../assets/branding/psu-primary-signature-horizontal.png";
import { AskPanel } from "./components/AskPanel";
import { ConfidenceBadge } from "./components/ConfidenceBadge";
import { DataQualityPanel } from "./components/DataQualityPanel";
import { MetricCard } from "./components/MetricCard";
import { PairedComparisonPanel } from "./components/PairedComparisonPanel";
import { TreatmentChart } from "./components/TreatmentChart";
import { TrialQueueTable } from "./components/TrialQueueTable";
import { humanizeErrorMessage, isUserCancelledRequest, USER_CANCELLED_REQUEST_MESSAGE } from "./core/errors";
import { parseTreatment } from "./core/treatments";
import {
  findTreatmentGlossaryEntry,
  TREATMENT_GLOSSARY_ENTRIES,
  TREATMENT_SYNTAX_GLOSSARY,
  type TreatmentGlossaryEntry
} from "./core/treatmentGlossary";
import { buildSpeciesResourceLinks } from "./core/speciesResources";
import type {
  DashboardData,
  DatasetState,
  ImportPreview,
  PropaguleType,
  SpeciesEffectVerdict,
  SpeciesResearchResult,
  SpeciesSummary,
  SpeciesTreatmentEffect,
  TreatmentCodebookEntry
} from "./core/types";
import "./App.css";

const navItems = [
  { label: "Imports", icon: FileSpreadsheet },
  { label: "Insight Board", icon: BarChart3 },
  { label: "Species Explorer", icon: Leaf },
  { label: "Treatment Comparator", icon: FlaskConical },
  { label: "Advanced Analysis", icon: Microscope },
  { label: "Trial Queue", icon: Database },
  { label: "Data Quality", icon: AlertCircle },
  { label: "Ask", icon: MessageSquareText },
  { label: "Glossary", icon: BookOpenText },
  { label: "Help", icon: CircleHelp }
] as const;

interface OpenAiConfirmRequest {
  action: string;
  resolve: (confirmed: boolean) => void;
}

type NavLabel = (typeof navItems)[number]["label"];

const emptyDashboard: DashboardData = {
  batch: null,
  metrics: {
    trials: 0,
    accessions: 0,
    species: 0,
    treatments: 0,
    doneRate: 0,
    observationsExtracted: 0
  },
  treatmentSummaries: [],
  speciesSummaries: [],
  speciesTreatmentEffects: [],
  pairedComparisons: [],
  trialQueue: [],
  dataQualityIssues: [],
  askSuggestions: [],
  speciesInsights: [],
  advancedComparisons: [],
  aiInsightStatus: {
    configured: false,
    state: "not_configured",
    message: "Import a workbook to begin.",
    model: null,
    generatedAt: null
  },
  speciesResearchCacheStatus: null
};

function AiStatusPill({ dashboard }: { dashboard: DashboardData }) {
  const status = dashboard.aiInsightStatus;
  const ready = status.state === "ready";
  return (
    <span className={ready ? "ai-state configured" : "ai-state"}>
      {ready || status.configured ? <BrainCircuit size={16} /> : <KeyRound size={16} />}
      {ready ? "AI insights cached" : status.configured ? "AI ready" : "AI optional"}
    </span>
  );
}

function speciesVerdictLabel(verdict: SpeciesEffectVerdict): string {
  switch (verdict) {
    case "one_observed_result":
      return "One observed result";
    case "early_local_pattern":
      return "Early local pattern";
    case "consistent_local_lift":
      return "Consistent local lift";
    case "consistent_lower_response":
      return "Consistent lower response";
    case "descriptive_only":
      return "Descriptive only";
    case "mixed_local_response":
      return "Mixed local response";
  }
}

function speciesVerdictDescription(effect: SpeciesTreatmentEffect): string {
  switch (effect.verdict) {
    case "one_observed_result":
      return "One matched accession recorded this result. Repeat it before treating it as a protocol recommendation.";
    case "early_local_pattern":
      return "Two matched accessions point in the same direction, but the local pattern still needs repetition.";
    case "consistent_local_lift":
      return effect.controlTreatment
        ? `${effect.treatmentA} repeatedly recorded a higher propagation response than the matched control.`
        : `${effect.treatmentA} repeatedly recorded a higher propagation response than ${effect.treatmentB}.`;
    case "consistent_lower_response":
      return effect.controlTreatment
        ? `${effect.treatmentA} repeatedly recorded a lower propagation response than the matched control.`
        : `${effect.treatmentA} repeatedly recorded a lower propagation response than ${effect.treatmentB}.`;
    case "descriptive_only":
      return "The matched workbook result is retained, but an undocumented treatment code prevents a protocol claim.";
    case "mixed_local_response":
      return "Matched accessions did not show a clear directional difference. Keep both treatments in the next trial.";
  }
}

function speciesVerdictClass(verdict: SpeciesEffectVerdict): string {
  return `species-effect-verdict ${verdict.replace(/_/g, "-")}`;
}

function displayTreatment(treatment: string, propaguleType: PropaguleType, codebook: TreatmentCodebookEntry[]): string {
  const parsed = parseTreatment(treatment, propaguleType, codebook);
  if (!parsed.tokens.length) return treatment;
  const labels = parsed.tokens.map((token) => {
    const entry = findTreatmentGlossaryEntry(token, propaguleType, codebook);
    const safeToExpand = entry?.status === "Workbook documented" || entry?.status === "Active codebook" || entry?.status === "Parser pattern";
    return safeToExpand ? entry.label : token;
  });
  const expanded = labels.join(" + ");
  return expanded === treatment ? treatment : `${expanded} (${treatment})`;
}

function propagationDifference(effect: SpeciesTreatmentEffect): string {
  const value = effect.scorePresentation === "percentage_points" && effect.exactPercentageDelta !== null
    ? effect.exactPercentageDelta
    : effect.meanDiff;
  const unit = effect.scorePresentation === "percentage_points" && effect.exactPercentageDelta !== null
    ? "percentage points"
    : "PC classes";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} ${unit}`;
}

function effectComparisonLabel(effect: SpeciesTreatmentEffect, codebook: TreatmentCodebookEntry[]): string {
  return `${displayTreatment(effect.treatmentA, effect.propaguleType, codebook)} vs ${displayTreatment(
    effect.treatmentB,
    effect.propaguleType,
    codebook
  )}`;
}

function followUpLabel(endpoint: "lpc" | "four_pc"): string {
  return endpoint === "lpc" ? "Liner rootball quality (LPC)" : "4-inch rootball quality (4PC)";
}

function researchScopeIdentity(dashboard: DashboardData): string {
  return dashboard.scope?.scopeHash ?? dashboard.batch?.workbookHash ?? "sample";
}

function researchKey(scopeIdentity: string, species: string): string {
  return `${scopeIdentity}:${species.toLowerCase()}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function familySourceText(source: SpeciesResearchResult["familySource"] | undefined): string {
  if (source === "workbook") return "Family from workbook";
  if (source === "ai_inferred") return "Family inferred from taxonomy";
  return "Family unresolved";
}

function familyStatusText(research: SpeciesResearchResult | undefined): string {
  if (research?.plantFamily) return `${research.plantFamily} · ${familySourceText(research.familySource)}`;
  return "Family unknown until research runs";
}

function sourceLabel(result: SpeciesResearchResult | undefined, sourceId: string): string {
  const source = result?.sources.find((candidate) => candidate.id === sourceId);
  if (!source) return sourceId;
  const year = source.year ? ` (${source.year})` : "";
  return `${source.title}${year}`;
}

function evidenceLevelText(level: SpeciesResearchResult["recommendedTechniques"][number]["evidenceLevel"]): string {
  switch (level) {
    case "local_species":
      return "Local species evidence";
    case "species_literature":
      return "Species literature";
    case "genus_background":
      return "Genus background";
    case "family_background":
      return "Family background";
    case "mixed":
      return "Mixed evidence";
  }
}

function speciesEffectRank(effect: SpeciesTreatmentEffect): number {
  switch (effect.verdict) {
    case "consistent_local_lift":
      return 6;
    case "consistent_lower_response":
      return 5;
    case "early_local_pattern":
      return 4;
    case "one_observed_result":
      return 3;
    case "mixed_local_response":
      return 2;
    case "descriptive_only":
      return 1;
  }
}

function orderedSpeciesEffects(effects: SpeciesTreatmentEffect[]): SpeciesTreatmentEffect[] {
  return [...effects].sort(
    (left, right) =>
      speciesEffectRank(right) - speciesEffectRank(left) ||
      right.pairCount - left.pairCount ||
      Math.abs(right.meanDiff) - Math.abs(left.meanDiff) ||
      left.treatmentA.localeCompare(right.treatmentA) ||
      left.treatmentB.localeCompare(right.treatmentB)
  );
}

function SpeciesEffectCard({
  effect,
  codebook
}: {
  effect: SpeciesTreatmentEffect;
  codebook: TreatmentCodebookEntry[];
}) {
  const comparison = effectComparisonLabel(effect, codebook);
  const comparisonId = `species-effect-${effect.id.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <article className="species-effect-card">
      <div className="species-effect-heading">
        <div>
          <span className="species-effect-propagule">{propaguleDisplay(effect.propaguleType)}</span>
          <h5 id={comparisonId}>{comparison}</h5>
          <p>{effect.outcome === "active" ? "In-progress matched trials — preliminary." : "Completed matched trials."}</p>
        </div>
        <span className={speciesVerdictClass(effect.verdict)}>{speciesVerdictLabel(effect.verdict)}</span>
      </div>

      <div className="species-effect-result" aria-labelledby={comparisonId}>
        <strong>{propagationDifference(effect)}</strong>
        <span>{speciesVerdictDescription(effect)}</span>
      </div>

      <dl className="species-effect-metrics">
        <div><dt>Matched accessions</dt><dd>{effect.accessionCount}</dd></div>
        <div><dt>Source lots</dt><dd>{effect.sourceAccessionCount}</dd></div>
        <div><dt>{effect.treatmentA} higher</dt><dd>{effect.higherCount}</dd></div>
        <div><dt>Tied</dt><dd>{effect.tiedCount}</dd></div>
        <div><dt>{effect.treatmentB} higher</dt><dd>{effect.lowerCount}</dd></div>
      </dl>

      {effect.followUps.length ? (
        <section className="species-follow-up" aria-label="After propagation outcomes">
          <strong>After propagation</strong>
          <div>
            {effect.followUps.map((followUp) => (
              <span key={followUp.endpoint}>
                {followUpLabel(followUp.endpoint)}: {followUp.treatmentAMean.toFixed(1)} vs {followUp.treatmentBMean.toFixed(1)}
                {followUp.meanDifference > 0 ? " (+" : " ("}{followUp.meanDifference.toFixed(1)}) · n={followUp.pairCount}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <details className="species-effect-evidence">
        <summary>View matched workbook evidence ({effect.evidence.length})</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Propagation accession</th>
                <th scope="col">Source lot</th>
                <th scope="col">Cohort</th>
                <th scope="col">{effect.treatmentA}</th>
                <th scope="col">{effect.treatmentB}</th>
                <th scope="col">Recorded</th>
                <th scope="col">Workbook row</th>
              </tr>
            </thead>
            <tbody>
              {effect.evidence.map((pair) => (
                <tr key={`${effect.id}-${pair.pAccession}-${pair.sourceRows.join("-")}`}>
                  <td>{pair.pAccession}</td>
                  <td>{pair.sourceAccession || "Not recorded"}</td>
                  <td>{pair.cohort}</td>
                  <td>{pair.scoreA}</td>
                  <td>{pair.scoreB}</td>
                  <td>{pair.recordedAt ?? "Not recorded"}</td>
                  <td>
                    {pair.sourceFilename ? `${pair.sourceFilename} · ` : ""}
                    {pair.worksheet ? `${pair.worksheet} · ` : ""}row {pair.sourceRows.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}

function SpeciesLocalResults({
  summary,
  effects,
  codebook
}: {
  summary: SpeciesSummary | undefined;
  effects: SpeciesTreatmentEffect[];
  codebook: TreatmentCodebookEntry[];
}) {
  const completed = orderedSpeciesEffects(effects.filter((effect) => effect.outcome === "completed"));
  const active = orderedSpeciesEffects(effects.filter((effect) => effect.outcome === "active"));
  const renderOutcome = (heading: string, description: string, rows: SpeciesTreatmentEffect[], state: "completed" | "active") => (
    <section className={`species-results-outcome ${state}`} key={state}>
      <div className="species-results-outcome-heading">
        <div>
          <h4>{heading}</h4>
          <p>{description}</p>
        </div>
        <span>{rows.length} contrast{rows.length === 1 ? "" : "s"}</span>
      </div>
      {rows.length ? (
        <div className="species-effects-by-propagule">
          {(["seed", "stem_cutting", "division"] as const).map((propagule) => {
            const group = rows.filter((effect) => effect.propaguleType === propagule);
            if (!group.length) return null;
            return (
              <section className="species-propagule-group" key={propagule}>
                <h5>{propaguleDisplay(propagule)}</h5>
                <div className="species-effect-list">
                  {group.map((effect) => <SpeciesEffectCard effect={effect} codebook={codebook} key={effect.id} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : state === "completed" ? (
        <div className="species-local-empty" role="status">
          <strong>No matched treatment comparison recorded for this species.</strong>
          <span>Observed treatment rows are not ranked because they are not a like-for-like accession comparison.</span>
        </div>
      ) : (
        <p className="species-outcome-empty">No in-progress matched treatment results are available.</p>
      )}
    </section>
  );

  return (
    <section className="species-local-results" aria-labelledby="local-propagation-results">
      <div className="species-local-results-heading">
        <div>
          <span>Workbook evidence first</span>
          <h4 id="local-propagation-results">Local propagation results</h4>
          <p>Compare treatments within the same accession and source lot before using research context or raw averages.</p>
        </div>
        <div className="species-metrics" aria-label="Local evidence counts">
          <span>{summary?.rows ?? 0} rows</span>
          <span>{summary?.accessions ?? 0} accessions</span>
          <span>{summary?.pcCount ?? 0} PC records</span>
        </div>
      </div>
      {renderOutcome("Completed matched trials", "These are the primary local results.", completed, "completed")}
      {renderOutcome("In-progress matched trials", "Useful early evidence; completion can still change the result.", active, "active")}
      {(summary?.unpairedScoredTreatmentCount ?? 0) > 0 ? (
        <p className="species-unpaired-note">
          {summary?.unpairedScoredTreatmentCount} treatment record{summary?.unpairedScoredTreatmentCount === 1 ? " is" : "s are"} scored but not part of a matched comparison.
        </p>
      ) : null}
    </section>
  );
}

function SpeciesResultsOverview({
  effects,
  codebook,
  onOpenSpecies
}: {
  effects: SpeciesTreatmentEffect[];
  codebook: TreatmentCodebookEntry[];
  onOpenSpecies: (species: string) => void;
}) {
  const visible = orderedSpeciesEffects(effects.filter((effect) => effect.outcome === "completed")).slice(0, 6);
  return (
    <section className="panel species-results-overview">
      <div className="panel-heading">
        <div>
          <h2>Species-level local results</h2>
          <p>Completed, matched workbook comparisons. Open a species to review the full local evidence.</p>
        </div>
        <span>{effects.filter((effect) => effect.outcome === "completed").length} results</span>
      </div>
      {visible.length ? (
        <div className="species-results-overview-list">
          {visible.map((effect) => (
            <button type="button" key={effect.id} onClick={() => onOpenSpecies(effect.species)}>
              <span>
                <strong>{effect.species}</strong>
                <small>{effectComparisonLabel(effect, codebook)}</small>
              </span>
              <span>
                <b>{propagationDifference(effect)}</b>
                <small>{effect.pairCount} matched accession{effect.pairCount === 1 ? "" : "s"} · {speciesVerdictLabel(effect.verdict)}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="species-results-overview-empty">No completed matched treatment comparisons are available in this scope yet.</p>
      )}
    </section>
  );
}

function SpeciesExplorer({
  dashboard,
  aiConfigured,
  actionDisabled,
  codebook,
  focusedSpecies,
  researchResults,
  researchErrors,
  researchingSpecies,
  onResearchSpecies,
  onFocusSpecies
}: {
  dashboard: DashboardData;
  aiConfigured: boolean;
  actionDisabled: boolean;
  codebook: TreatmentCodebookEntry[];
  focusedSpecies: { scopeIdentity: string; species: string } | null;
  researchResults: Record<string, SpeciesResearchResult>;
  researchErrors: Record<string, string>;
  researchingSpecies: string | null;
  onResearchSpecies: (species: string, force?: boolean) => void;
  onFocusSpecies: (species: string) => void;
}) {
  const hasBatch = Boolean(dashboard.batch);
  const speciesOptions = useMemo(() => {
    const bySpecies = new Map<string, { summary?: SpeciesSummary }>();
    for (const summary of dashboard.speciesSummaries) {
      bySpecies.set(summary.species, { ...(bySpecies.get(summary.species) ?? {}), summary });
    }
    return [...bySpecies.entries()]
      .map(([species, value]) => ({ species, ...value }))
      .sort((a, b) => {
        const aRows = a.summary?.rows ?? 0;
        const bRows = b.summary?.rows ?? 0;
        return bRows - aRows || a.species.localeCompare(b.species);
      });
  }, [dashboard.speciesSummaries]);
  const firstSpecies = speciesOptions[0]?.species ?? "";
  const [selectedSpecies, setSelectedSpecies] = useState(firstSpecies);
  const [speciesFilter, setSpeciesFilter] = useState("");
  const scopeIdentity = researchScopeIdentity(dashboard);
  const previousScopeIdentityRef = useRef(scopeIdentity);
  const filteredSpeciesOptions = useMemo(() => {
    const query = speciesFilter.trim().toLocaleLowerCase();
    if (!query) return speciesOptions;
    return speciesOptions.filter((option) => option.species.toLocaleLowerCase().includes(query));
  }, [speciesFilter, speciesOptions]);
  const emptyTitle = !hasBatch
    ? "Import a workbook to browse local propagation evidence."
    : !aiConfigured
      ? "Load cached AI research or add an OpenAI key to generate it."
      : "Select a species to run AI protocol research.";
  useEffect(() => {
    const scopeChanged = previousScopeIdentityRef.current !== scopeIdentity;
    if (scopeChanged) previousScopeIdentityRef.current = scopeIdentity;
    if (!firstSpecies) {
      if (selectedSpecies) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedSpecies("");
      }
      return;
    }
    const requestedSpecies =
      focusedSpecies?.scopeIdentity === scopeIdentity && speciesOptions.some((option) => option.species === focusedSpecies.species)
      ? focusedSpecies.species
      : null;
    if (requestedSpecies && requestedSpecies !== selectedSpecies) {
      setSelectedSpecies(requestedSpecies);
      return;
    }
    if (scopeChanged || !speciesOptions.some((option) => option.species === selectedSpecies)) {
      // The selected species belongs to the preceding scope; replace it with
      // the first valid option after the asynchronous scope/data refresh.
      setSelectedSpecies(firstSpecies);
    }
  }, [firstSpecies, focusedSpecies, scopeIdentity, selectedSpecies, speciesOptions]);

  const selectedSummary =
    dashboard.speciesSummaries.find((summary) => summary.species === selectedSpecies) ?? speciesOptions[0]?.summary;
  const activeSpecies = selectedSummary?.species ?? selectedSpecies;
  const selectedEffects = useMemo(
    () => (dashboard.speciesTreatmentEffects ?? []).filter((effect) => effect.species === activeSpecies),
    [activeSpecies, dashboard.speciesTreatmentEffects]
  );
  const selectedLinks = activeSpecies ? buildSpeciesResourceLinks(activeSpecies) : [];
  const cacheMissingSpecies = useMemo(
    () => new Set(dashboard.speciesResearchCacheStatus?.missingSpecies ?? []),
    [dashboard.speciesResearchCacheStatus?.missingSpecies]
  );
  const hasCacheStatus = Boolean(dashboard.speciesResearchCacheStatus?.totalSpecies);
  const activeResearchKey = researchKey(scopeIdentity, activeSpecies);
  const selectedResearch = researchResults[activeResearchKey];
  const selectedResearchError = researchErrors[activeResearchKey];
  const selectedResearchCancelled = selectedResearchError === USER_CANCELLED_REQUEST_MESSAGE;
  const isResearching = researchingSpecies === activeResearchKey;
  const cachedResearchAvailable = hasCacheStatus && !cacheMissingSpecies.has(activeSpecies);
  const canResearch =
    hasBatch &&
    Boolean(activeSpecies) &&
    !actionDisabled &&
    !isResearching &&
    (aiConfigured || Boolean(selectedResearch) || cachedResearchAvailable);

  useEffect(() => {
    if (!hasBatch || !activeSpecies || selectedResearch || selectedResearchError || isResearching) return;
    // Cached local research can load automatically. Live research remains an
    // explicit user action and requires an app-styled confirmation before IPC.
    if (!cachedResearchAvailable) return;
    onResearchSpecies(activeSpecies, false);
  }, [
    activeSpecies,
    cachedResearchAvailable,
    hasBatch,
    isResearching,
    onResearchSpecies,
    selectedResearch,
    selectedResearchError
  ]);

  return (
    <section className="view-stack">
      <section className="panel species-workbench-panel">
        <div className="panel-heading">
          <div>
            <h2>Species Explorer</h2>
            <p>Matched local workbook evidence comes first. AI research adds context below it.</p>
          </div>
          <div className="species-actions">
            <AiStatusPill dashboard={dashboard} />
            {hasBatch ? (
              <button
                type="button"
                onClick={() => onResearchSpecies(activeSpecies, Boolean(selectedResearch && aiConfigured))}
                disabled={!canResearch}
              >
                <RefreshCw size={16} />
                {isResearching
                  ? "Researching..."
                  : selectedResearch
                    ? aiConfigured
                      ? "Refresh research"
                      : "Reload cached research"
                    : aiConfigured
                      ? "Run research"
                      : "Load cached research"}
              </button>
            ) : null}
          </div>
        </div>

        {speciesOptions.length ? (
          <div className="species-workbench">
            <div className="species-selector-column">
              <label className="species-filter">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Filter species"
                  placeholder="Filter species"
                  value={speciesFilter}
                  onChange={(event) => setSpeciesFilter(event.target.value)}
                />
              </label>
              <nav className="species-selector" aria-label="Species">
                {filteredSpeciesOptions.map((option) => (
                  <button
                    type="button"
                    aria-pressed={option.species === activeSpecies}
                    className={option.species === activeSpecies ? "active" : ""}
                    key={option.species}
                    onClick={() => {
                      setSelectedSpecies(option.species);
                      onFocusSpecies(option.species);
                    }}
                  >
                    <span>{option.species}</span>
                    <small>
                      {option.summary?.rows ?? 0} rows
                      {researchResults[researchKey(scopeIdentity, option.species)] ||
                      (hasCacheStatus && !cacheMissingSpecies.has(option.species))
                        ? " · researched"
                        : ""}
                    </small>
                  </button>
                ))}
                {!filteredSpeciesOptions.length ? (
                  <p className="species-filter-empty" role="status">
                    No species match this filter.
                  </p>
                ) : null}
              </nav>
            </div>

            <article className="species-detail">
              <div className="species-detail-heading">
                <div>
                  <h3>{activeSpecies}</h3>
                  <span>{familyStatusText(selectedResearch)}</span>
                </div>
              </div>

              <SpeciesLocalResults summary={selectedSummary} effects={selectedEffects} codebook={codebook} />

              {isResearching ? (
                <section className="species-research-state">
                  <RefreshCw className="spin" size={22} />
                  <div>
                    <h4>{aiConfigured ? "Running source-backed germination research" : "Loading cached source-backed research"}</h4>
                    <p>
                      {aiConfigured
                        ? "Searching web sources, checking taxonomy context, and connecting findings to workbook rows."
                        : "Looking for a cached source-backed assessment for this species."}
                    </p>
                  </div>
                </section>
              ) : selectedResearch ? (
                <>
                  <section className="species-detail-section primary ai-assessment-card">
                    <h4>
                      {selectedResearch.status === "no_sources"
                        ? "No valid local-row technique survived"
                        : "Research assessment"}
                    </h4>
                    <p>{selectedResearch.summary}</p>
                    <p>{selectedResearch.likelyStrategy}</p>
                  </section>

                  <div className="species-support-grid">
                    <section className="species-detail-section">
                      <h4>Family and related-taxon pattern</h4>
                      <p>{selectedResearch.familyPattern}</p>
                    </section>

                    <section className="species-detail-section">
                      <h4>Next trial</h4>
                      <p>{selectedResearch.nextTrialDesign}</p>
                    </section>
                  </div>

                  {selectedResearch.protocolGaps.length ? (
                    <section className="species-detail-section protocol-gaps-section">
                      <h4>Protocol gaps to resolve</h4>
                      <ul>
                        {selectedResearch.protocolGaps.map((gap) => (
                          <li key={gap}>{gap}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className="species-detail-section technique-section">
                    <h4>Research-backed technique candidates</h4>
                    {selectedResearch.recommendedTechniques.length ? (
                      <div className="technique-grid">
                        {selectedResearch.recommendedTechniques.map((recommendation) => (
                          <article className="technique-card" key={`${activeSpecies}-${recommendation.technique}`}>
                            <div>
                              <strong>{recommendation.technique}</strong>
                              <ConfidenceBadge label={recommendation.deterministicConfidence} />
                            </div>
                            <span className="evidence-level-pill">{evidenceLevelText(recommendation.evidenceLevel)}</span>
                            <p>{recommendation.recommendation}</p>
                            <p>{recommendation.evidenceSummary}</p>
                            <small>
                              Sources:{" "}
                              {recommendation.sourceIds.length
                                ? recommendation.sourceIds.map((sourceId) => sourceLabel(selectedResearch, sourceId)).join("; ")
                                : "local workbook rows only"}
                            </small>
                            <small>
                              {recommendation.localRows.length
                                ? `Local rows: ${recommendation.localRows.join(", ")}`
                                : "No local row directly supports this; treat it as a low-priority hypothesis."}
                            </small>
                            <div className="technique-protocol-grid">
                              <span>
                                <b>Protocol frame</b>
                                {recommendation.protocolFrame}
                              </span>
                              <span>
                                <b>Controls</b>
                                {recommendation.experimentalControls}
                              </span>
                              <span>
                                <b>Success criteria</b>
                                {recommendation.successCriteria}
                              </span>
                              <span>
                                <b>Risk checks</b>
                                {recommendation.riskChecks}
                              </span>
                            </div>
                            <div className="technique-proof-grid">
                              <span>
                                <b>Try next</b>
                                {recommendation.whatToTry}
                              </span>
                              <span>
                                <b>Change course if</b>
                                {recommendation.whatWouldChangeMind}
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>No technique recommendation is shown because no valid local-row claim survived validation.</p>
                    )}
                  </section>

                  <div className="species-detail-grid">
                    <section className="species-detail-section">
                      <h4>Caveats</h4>
                      <ul>
                        {selectedResearch.caveats.map((caveat) => (
                          <li key={caveat}>{caveat}</li>
                        ))}
                      </ul>
                    </section>

                    <section className="species-detail-section">
                      <h4>Evidence notes</h4>
                      <ul>
                        {selectedResearch.evidenceNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  {selectedResearch.sources.length ? (
                    <section className="species-detail-section research-sources">
                      <div className="resource-heading">
                        <h4>Reference sources used</h4>
                        <span>Sources cited in this assessment; workbook rows own deterministic evidence tiers.</span>
                      </div>
                      <div className="species-resource-grid">
                        {selectedResearch.sources.map((source) => (
                          <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                            <strong>
                              {source.title}
                              <ExternalLink size={13} />
                            </strong>
                            <span>
                              {source.venue ?? source.source}
                              {source.year ? ` · ${source.year}` : ""} · {source.relevance}
                            </span>
                            {source.abstractSnippet ? <span>{source.abstractSnippet}</span> : null}
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : selectedResearchError ? (
                <section className={`species-research-state${selectedResearchCancelled ? "" : " warning"}`}>
                  {selectedResearchCancelled ? <BrainCircuit size={22} /> : <AlertCircle size={22} />}
                  <div>
                    <h4>{selectedResearchCancelled ? "Request cancelled by user" : "Research did not complete"}</h4>
                    {selectedResearchCancelled ? <p>No OpenAI request was sent.</p> : <p>{selectedResearchError}</p>}
                  </div>
                </section>
              ) : !aiConfigured ? (
                <section className="species-research-state">
                  <BrainCircuit size={22} />
                  <div>
                    <h4>OpenAI key is not configured</h4>
                    <p>Cached AI research will load when available. Add a key in Settings to generate or refresh research.</p>
                  </div>
                </section>
              ) : (
                <section className="species-research-state">
                  <BrainCircuit size={22} />
                  <div>
                    <h4>Ready to research this species</h4>
                    <p>The app will search web sources, check taxonomy context, and connect findings to workbook rows.</p>
                  </div>
                </section>
              )}

              {selectedLinks.length ? (
                <section className="species-detail-section resources">
                  <div className="resource-heading">
                    <h4>Regional reference</h4>
                    <span>Occurrence context only; not treated as germination evidence.</span>
                  </div>
                  <div className="species-resource-grid">
                    {selectedLinks.map((link) => (
                      <a href={link.url} target="_blank" rel="noreferrer" key={`${activeSpecies}-${link.source}`}>
                        <strong>
                          {link.label}
                          <ExternalLink size={13} />
                        </strong>
                        <span>{link.purpose}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

            </article>
          </div>
        ) : (
          <div className="empty-state">
            <BrainCircuit size={22} />
            <strong>{emptyTitle}</strong>
            <span>Deterministic species summaries remain available below.</span>
          </div>
        )}
      </section>

    </section>
  );
}

function propaguleDisplay(value: PropaguleType | "any" | undefined): string {
  if (!value || value === "any") return "Any";
  return value.replace("_", " ");
}

function glossaryStatusClass(status: TreatmentGlossaryEntry["status"]): string {
  return `glossary-status ${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function GlossaryEntryTable({
  title,
  description,
  entries
}: {
  title: string;
  description: string;
  entries: TreatmentGlossaryEntry[];
}) {
  return (
    <section className="panel glossary-table-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table glossary-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Scope</th>
              <th>Meaning</th>
              <th>Confidence</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={`${entry.propaguleType}-${entry.token}`}>
                <td>
                  <strong>{entry.token}</strong>
                  {entry.aliases?.length ? <span className="muted"> aliases: {entry.aliases.join(", ")}</span> : null}
                </td>
                <td>{propaguleDisplay(entry.propaguleType)}</td>
                <td>
                  <strong>{entry.label}</strong>
                  <span>{entry.meaning}</span>
                </td>
                <td>
                  <span className={glossaryStatusClass(entry.status)}>{entry.status}</span>
                </td>
                <td>
                  {entry.details ? <span>{entry.details}</span> : <span className="muted">Defined by workbook/code syntax.</span>}
                  {entry.examples?.length ? <span className="muted"> Examples: {entry.examples.join(", ")}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TreatmentGlossaryPanel({
  dashboard,
  codebook
}: {
  dashboard: DashboardData;
  codebook: TreatmentCodebookEntry[];
}) {
  const documentedEntries = TREATMENT_GLOSSARY_ENTRIES.filter((entry) => entry.status === "Workbook documented");
  const contextualEntries = TREATMENT_GLOSSARY_ENTRIES.filter((entry) => entry.status !== "Workbook documented");
  const observedTreatments = useMemo(
    () =>
      [...dashboard.treatmentSummaries]
        .sort((left, right) =>
          propaguleDisplay(left.propaguleType).localeCompare(propaguleDisplay(right.propaguleType)) ||
          left.treatment.localeCompare(right.treatment)
        )
        .map((summary) => {
          const propaguleType = summary.propaguleType ?? "unknown";
          const parsed = parseTreatment(summary.treatment, propaguleType, codebook);
          const tokenDescriptions = parsed.tokens.map((token) => {
            const entry = findTreatmentGlossaryEntry(token, propaguleType, codebook);
            return {
              token,
              entry,
              text: entry ? `${token} = ${entry.label}` : `${token} = needs codebook mapping`
            };
          });
          const reviewWarnings = tokenDescriptions
            .filter(({ entry }) => entry && entry.status !== "Workbook documented" && entry.status !== "Active codebook")
            .map(({ token, entry }) => `${token}: ${entry?.status.toLowerCase()}`);
          return {
            summary,
            normalized: parsed.normalized,
            tokenDescriptions,
            warnings: [
              ...parsed.warnings.map((warning) => warning.replace("Unmapped treatment token: ", "Needs codebook mapping: ")),
              ...reviewWarnings
            ]
          };
        }),
    [codebook, dashboard.treatmentSummaries]
  );

  return (
    <section className="view-stack glossary-panel">
      <section className="panel glossary-intro">
        <div className="panel-heading">
          <div>
            <h2>Treatment Glossary</h2>
            <p>Human-readable treatment acronyms, separated from statistical eligibility.</p>
          </div>
          <span>{documentedEntries.length + contextualEntries.length} defined codes</span>
        </div>
        <div className="glossary-note-grid">
          <article>
            <strong>Column matters</strong>
            <span>
              In the treatment column, CS means cold stratification. In the propagule-type column, CS means stem cutting.
            </span>
          </article>
          <article>
            <strong>Definitions are not claims</strong>
            <span>
              The glossary explains codes; formal inference still requires documented codebook entries and eligible completed rows.
            </span>
          </article>
          <article>
            <strong>Ambiguous codes stay visible</strong>
            <span>Species-like or local tokens are shown as needing codebook mapping instead of being silently interpreted.</span>
          </article>
        </div>
      </section>

      <GlossaryEntryTable
        title="Workbook-documented treatment codes"
        description="These come from the embedded workbook treatment dictionary and are safe to use as plain-language definitions."
        entries={documentedEntries}
      />

      <GlossaryEntryTable
        title="Contextual and workbook-local codes"
        description="These are useful for field conversations, but flagged when the workbook dictionary does not fully define them."
        entries={contextualEntries}
      />

      <GlossaryEntryTable
        title="Treatment-string syntax"
        description="How the app reads compound treatment strings before applying the statistical codebook gates."
        entries={TREATMENT_SYNTAX_GLOSSARY}
      />

      <section className="panel glossary-table-panel">
        <div className="panel-heading">
          <div>
            <h2>Active scope treatment strings</h2>
            <p>Parsed from the currently loaded local database scope; unknowns remain descriptive-only.</p>
          </div>
          <span>{observedTreatments.length} strings</span>
        </div>
        {observedTreatments.length ? (
          <div className="table-wrap">
            <table className="data-table glossary-table">
              <thead>
                <tr>
                  <th>Treatment string</th>
                  <th>Propagule</th>
                  <th>Parsed meaning</th>
                  <th>Rows</th>
                  <th>Review flags</th>
                </tr>
              </thead>
              <tbody>
                {observedTreatments.map(({ summary, normalized, tokenDescriptions, warnings }) => (
                  <tr key={`${summary.propaguleType ?? "unknown"}-${summary.treatment}`}>
                    <td>
                      <strong>{summary.treatment}</strong>
                      {normalized && normalized !== summary.treatment ? <span className="muted"> normalized: {normalized}</span> : null}
                    </td>
                    <td>{propaguleDisplay(summary.propaguleType)}</td>
                    <td>
                      {tokenDescriptions.length ? (
                        tokenDescriptions.map(({ token, entry, text }, index) => (
                          <span
                            key={`${summary.treatment}-${token}-${index}`}
                            className={entry ? "token-chip" : "token-chip token-chip-warning"}
                          >
                            {text}
                          </span>
                        ))
                      ) : (
                        <span className="token-chip token-chip-warning">No parsed treatment tokens</span>
                      )}
                    </td>
                    <td>{summary.rows}</td>
                    <td>
                      {warnings.length ? (
                        warnings.map((warning, index) => (
                          <span key={`${summary.treatment}-${warning}-${index}`} className="review-flag">
                            {warning}
                          </span>
                        ))
                      ) : (
                        <span className="glossary-status workbook-documented">Documented</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Import or select a workbook scope to see the treatment strings present in that local database.</p>
        )}
      </section>
    </section>
  );
}

function HelpPanel() {
  return (
    <section className="view-stack">
      <section className="panel help-panel">
        <div className="panel-heading">
          <div>
            <h2>Help and project information</h2>
            <p>Practical support details for the SeedBank Insights evaluation prototype.</p>
          </div>
        </div>
        <div className="help-grid">
          <article>
            <h3>Project home</h3>
            <p>
              Source code and issue tracking live at{" "}
              <a href="https://github.com/jfleezy23/seedbank-insights" target="_blank" rel="noreferrer">
                github.com/jfleezy23/seedbank-insights
                <ExternalLink size={13} />
              </a>
              .
            </p>
          </article>
          <article>
            <h3>Contact and support</h3>
            <p>
              For demo feedback, support, or donation coordination, contact{" "}
              <a href="mailto:jflow23@icloud.com">jflow23@icloud.com</a>.
            </p>
          </article>
          <article>
            <h3>Privacy</h3>
            <p>
              Workbooks, local database files, and AI response cache files stay local. OpenAI keys are stored through
              Electron main using OS safe storage and are not exposed to renderer code.
            </p>
          </article>
          <article>
            <h3>License</h3>
            <p>
              This prototype is provided free of charge to PSU Seed Bank for testing and evaluation, without warranty.
              See <a href="https://github.com/jfleezy23/seedbank-insights/blob/main/LICENSE.md" target="_blank" rel="noreferrer">LICENSE.md</a>{" "}
              and{" "}
              <a
                href="https://github.com/jfleezy23/seedbank-insights/blob/main/docs/THIRD_PARTY_NOTICES.md"
                target="_blank"
                rel="noreferrer"
              >
                third-party notices
              </a>
              .
            </p>
          </article>
        </div>
      </section>

      <section className="panel help-panel">
        <div className="panel-heading">
          <div>
            <h2>How to use the prototype</h2>
            <p>Keep each tab focused on its job while reviewing a workbook.</p>
          </div>
        </div>
        <div className="help-steps">
          <span>1. Import a PSU-style workbook or load the local workbook.</span>
          <span>2. Use Insight Board for status and where-to-go-next routing.</span>
          <span>3. Use Species Explorer for matched local treatment evidence by species, with AI context below it.</span>
          <span>4. Use Data Quality and Trial Queue to fix workbook rows before making protocol decisions.</span>
        </div>
      </section>
    </section>
  );
}

function OpenAiConfirmModal({
  request,
  onResolve
}: {
  request: OpenAiConfirmRequest | null;
  onResolve: (confirmed: boolean) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;

    continueButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onResolve, request]);

  if (!request) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(false);
      }}
    >
      <section ref={dialogRef} className="settings-modal openai-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="openai-confirm-title">
        <div className="panel-heading">
          <div>
            <span className="ai-state configured">
              <BrainCircuit size={16} />
              AI transfer
            </span>
            <h2 id="openai-confirm-title">Send workbook evidence to OpenAI?</h2>
            <p>Continue with {request.action}?</p>
          </div>
          <button type="button" aria-label="Cancel OpenAI request" onClick={() => onResolve(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="openai-confirm-copy">
          <p>The app sends only bounded, source-cited evidence from the active analysis scope. Your API key stays on this device.</p>
          <p>Cancel keeps workbook data local and does not start the OpenAI request.</p>
        </div>
        <div className="settings-actions">
          <button type="button" className="secondary-action" onClick={() => onResolve(false)}>
            Cancel
          </button>
          <button ref={continueButtonRef} type="button" className="primary-action" onClick={() => onResolve(true)}>
            <BrainCircuit size={16} />
            Continue
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsModal({
  open,
  apiKeyInput,
  safeStorageAvailable,
  aiConfigured,
  saving,
  onClose,
  onInput,
  onSave,
  onClear
}: {
  open: boolean;
  apiKeyInput: string;
  safeStorageAvailable: boolean;
  aiConfigured: boolean;
  saving: boolean;
  onClose: () => void;
  onInput: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.tabIndex >= 0);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialogRef} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="panel-heading">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>{safeStorageAvailable ? "OpenAI keys are stored with OS safe storage." : "OS safe storage is unavailable."}</p>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label htmlFor="openai-key">OpenAI API key</label>
        <input
          id="openai-key"
          type="password"
          value={apiKeyInput}
          onChange={(event) => onInput(event.target.value)}
          placeholder={aiConfigured ? "Key configured" : "sk-..."}
          disabled={!safeStorageAvailable || saving}
        />
        <div className="settings-actions">
          <button type="button" onClick={onSave} disabled={!apiKeyInput.trim() || !safeStorageAvailable || saving}>
            <Save size={16} />
            Save key
          </button>
          <button type="button" onClick={onClear} disabled={!aiConfigured || saving}>
            <Trash2 size={16} />
            Clear key
          </button>
        </div>
      </section>
    </div>
  );
}

function DatasetManager({
  dataset,
  previews,
  codebook,
  busy,
  onPreview,
  onCommit,
  onCheckUpdate,
  onRelink,
  onSelectWorksheet,
  onSelectScope,
  onCreateCombinedScope,
  onSaveCodebook
}: {
  dataset: DatasetState;
  previews: ImportPreview[];
  codebook: TreatmentCodebookEntry[];
  busy: boolean;
  onPreview: () => void;
  onCommit: () => void;
  onCheckUpdate: (sourceId: number) => void;
  onRelink: (sourceId: number) => void;
  onSelectWorksheet: (token: string, worksheetName: string) => void;
  onSelectScope: (scopeId: number) => void;
  onCreateCombinedScope: () => void;
  onSaveCodebook: (entry: Omit<TreatmentCodebookEntry, "id" | "builtIn">) => void;
}) {
  const [propaguleType, setPropaguleType] = useState<PropaguleType>("seed");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [meaning, setMeaning] = useState("");
  const activeScope = dataset.scopes.find((scope) => scope.id === dataset.activeScopeId);

  function submitCodebook(event: FormEvent) {
    event.preventDefault();
    if (!token.trim() || !label.trim() || !meaning.trim()) return;
    onSaveCodebook({ version: 0, propaguleType, token, label, meaning, active: true });
    setToken("");
    setLabel("");
    setMeaning("");
  }

  return (
    <section className="view-stack">
      <section className="panel import-panel">
        <div className="panel-heading">
          <div>
            <h2>Dataset Manager</h2>
            <p>Synced workbook files remain the source of truth. Imports are immutable and require preview.</p>
          </div>
          <span className="scope-chip">Scope: {activeScope?.name ?? "None"}</span>
        </div>
        <div className="import-help-grid" aria-label="Dataset Manager concepts">
          <article className="import-help-card">
            <strong>Choose workbooks</strong>
            <p>
              Pick local synced files and review the preview first. Nothing becomes active until you import reviewed
              versions.
            </p>
          </article>
          <article className="import-help-card">
            <strong>Relink moved files</strong>
            <p>
              Use Relink when Google Drive moves, renames, or makes a file cloud-only. It reconnects the source without
              replacing history.
            </p>
          </article>
          <article className="import-help-card">
            <strong>Pick what to analyze</strong>
            <p>
              The active scope is what the rest of the app uses. Choose one cohort or an explicit combined scope.
            </p>
          </article>
          <article className="import-help-card">
            <strong>Document unknown codes</strong>
            <p>
              The Glossary explains acronyms. The codebook changes analysis only after you document a known
              propagule-specific meaning.
            </p>
          </article>
        </div>
        <div className="import-actions">
          <button type="button" onClick={onPreview} disabled={busy}>
            <FileSpreadsheet size={17} /> Choose workbook files
          </button>
          <button type="button" onClick={onCreateCombinedScope} disabled={busy || dataset.sources.length < 2}>
            Create combined scope
          </button>
        </div>
        <div className="dataset-grid">
          <div>
            <h3>Workbook sources</h3>
            <p className="inline-help">
              These are the workbook files the app knows about. Check for updates compares the synced file with the
              last imported version.
            </p>
            {dataset.sources.length ? dataset.sources.map((source) => (
              <article className="dataset-row" key={source.id}>
                <div>
                  <strong>{source.label}</strong>
                  <small>{source.canonicalPath}</small>
                  <small>{source.available ? "Available" : "Unavailable or cloud-only — relink before importing."}</small>
                </div>
                <div className="import-actions"><button type="button" onClick={() => onCheckUpdate(source.id)} disabled={busy}>Check for updates</button><button type="button" onClick={() => onRelink(source.id)} disabled={busy}>Relink</button></div>
              </article>
            )) : <p>No workbook sources registered.</p>}
          </div>
          <div>
            <h3>Active analysis scope</h3>
            <p className="inline-help">
              This controls Insight Board, Advanced Analysis, Ask, and species research. Imports do not switch it for
              you.
            </p>
            <select
              aria-label="Active analysis scope"
              value={dataset.activeScopeId ?? ""}
              onChange={(event) => onSelectScope(Number(event.target.value))}
              disabled={busy || !dataset.scopes.length}
            >
              {!dataset.scopes.length ? <option value="">No scopes</option> : null}
              {dataset.scopes.map((scope) => (
                <option value={scope.id} key={scope.id}>{scope.name}{scope.isCombined ? " · combined" : ""}</option>
              ))}
            </select>
            <p>Changing scope is explicit and never happens during import.</p>
          </div>
        </div>
      </section>

      {previews.length ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Import compatibility preview</h2>
              <p>
                Review before importing. Accepted rows can be analyzed; quarantined rows stay visible for cleanup
                instead of disappearing.
              </p>
            </div>
          </div>
          <div className="preview-grid">
            {previews.map((preview) => (
              <article className="preview-card" key={preview.token}>
                <strong>{preview.filename}</strong>
                <span>{preview.worksheetName} · {preview.populatedRows} populated rows</span>
                <dl>
                  <div><dt>Accepted</dt><dd>{preview.acceptedRows}</dd></div>
                  <div><dt>Quarantined</dt><dd>{preview.quarantinedRows.length}</dd></div>
                  <div><dt>Warnings</dt><dd>{preview.issues.length}</dd></div>
                </dl>
                {preview.duplicateCandidates.length ? <p>{preview.duplicateCandidates.length} ambiguous duplicate rows require classification.</p> : null}
                {preview.requiresReprocessing ? <p>Content is unchanged, but this import uses an older parser. Commit to refresh derived fields in place without creating a duplicate version.</p> : preview.unchangedSourceId ? <p>Content matches an existing source version; committing creates no duplicate.</p> : null}
                {preview.candidates.length > 1 ? (
                  <label>
                    Worksheet
                    <select
                      aria-label={`Worksheet for ${preview.filename}`}
                      value={preview.worksheetName}
                      onChange={(event) => onSelectWorksheet(preview.token, event.target.value)}
                      disabled={busy}
                    >
                      {preview.candidates.map((candidate) => (
                        <option key={candidate.worksheetName} value={candidate.worksheetName}>
                          {candidate.worksheetName} ({candidate.populatedRows} rows; {candidate.headerCoverage} matching headers)
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {preview.quarantinedRows.length ? <p>{preview.quarantinedRows.slice(0, 3).map((row) => `Row ${row.sourceRow}: ${row.reasons.join(", ")}`).join(" · ")}</p> : null}
              </article>
            ))}
          </div>
          <button type="button" className="primary" onClick={onCommit} disabled={busy}>Import reviewed versions</button>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Treatment codebook</h2>
            <p>
              Advanced: this is where documented local treatment codes become eligible for formal analysis.
            </p>
          </div>
          <span>{codebook.length} entries</span>
        </div>
        <p className="inline-help">
          If you do not know what a token means, leave it descriptive. Saving a codebook entry creates a new version,
          reruns eligibility, and does not change raw workbook values.
        </p>
        <form className="codebook-form" onSubmit={submitCodebook}>
          <label className="codebook-field">
            <span>Propagule</span>
            <select value={propaguleType} onChange={(event) => setPropaguleType(event.target.value as PropaguleType)}>
              <option value="seed">Seed</option><option value="stem_cutting">Stem cutting</option><option value="division">Division</option>
            </select>
          </label>
          <label className="codebook-field">
            <span>Token</span>
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Example: E" />
          </label>
          <label className="codebook-field">
            <span>Plain label</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Example: Ethephon" />
          </label>
          <label className="codebook-field">
            <span>Documented meaning</span>
            <input value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="What the token means for this propagule type" />
          </label>
          <button type="submit" disabled={busy}>Save new version</button>
        </form>
      </section>
    </section>
  );
}

function AdvancedAnalysis({
  dashboard,
  busy,
  onExport,
  onOpenImports
}: {
  dashboard: DashboardData;
  busy: boolean;
  onExport: () => void;
  onOpenImports: () => void;
}) {
  const rows = dashboard.advancedComparisons ?? [];
  const requiresReprocessing = Boolean(dashboard.scope?.requiresReprocessing);
  const exportDisabled = busy || !dashboard.scope || requiresReprocessing || rows.length === 0;
  return (
    <section className="view-stack">
      <section className="panel">
        <div className="panel-heading"><div><h2>Advanced Analysis</h2><p>Completed trials only; species-clustered uncertainty and Holm-adjusted exact sign tests.</p></div><div className="import-actions"><span className="scope-chip">{dashboard.scope?.name ?? dashboard.batch?.filename ?? "No scope"}</span><button type="button" onClick={onExport} disabled={exportDisabled}><Download size={16} /> Export reproducible files</button></div></div>
        {requiresReprocessing ? (
          <section className="analysis-refresh-notice" role="alert">
            <strong>Analysis refresh required</strong>
            <p>
              This scope was imported by an older parser, so completed outcomes may be missing. Open Dataset Manager,
              choose <em>Check for updates</em> for this source, review the parser-refresh preview, and import it.
            </p>
            <button type="button" onClick={onOpenImports} disabled={busy}>Open Dataset Manager</button>
          </section>
        ) : null}
        <div className="table-scroll">
          <table className="advanced-table">
            <thead><tr><th>Propagule</th><th>Contrast</th><th>Pairs / species</th><th>W / T / L</th><th>Species effect</th><th>95% clustered CI</th><th>Adjusted p</th><th>Evidence</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td>{row.propaguleType.replace("_", " ")}</td><td>{row.treatment} vs {row.baseline}</td>
                <td>{row.pairCount} / {row.speciesCount}</td><td>{row.wins} / {row.ties} / {row.losses}</td>
                <td>{row.speciesMeanDiff.toFixed(2)}</td><td>{row.ciLow.toFixed(2)} to {row.ciHigh.toFixed(2)}</td>
                <td>{row.adjustedPValue === null ? "suppressed" : row.adjustedPValue.toFixed(4)}</td><td><ConfidenceBadge label={row.confidence} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!rows.length && !requiresReprocessing ? <p>No eligible completed treatment contrasts in this scope. Exports become available after the selected scope has completed, documented paired contrasts.</p> : null}
      </section>
    </section>
  );
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [dataset, setDataset] = useState<DatasetState>({ sources: [], scopes: [], activeScopeId: null });
  const [importPreviews, setImportPreviews] = useState<ImportPreview[]>([]);
  const [codebook, setCodebook] = useState<TreatmentCodebookEntry[]>([]);
  const [selectedNav, setSelectedNav] = useState<NavLabel>("Insight Board");
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [safeStorageAvailable, setSafeStorageAvailable] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openAiConfirmRequest, setOpenAiConfirmRequest] = useState<OpenAiConfirmRequest | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [speciesResearchResults, setSpeciesResearchResults] = useState<Record<string, SpeciesResearchResult>>({});
  const [speciesResearchErrors, setSpeciesResearchErrors] = useState<Record<string, string>>({});
  const [researchingSpecies, setResearchingSpecies] = useState<string | null>(null);
  const researchingSpeciesRef = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focusedSpecies, setFocusedSpecies] = useState<{ scopeIdentity: string; species: string } | null>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSpeciesExplorer = useCallback((species: string) => {
    setFocusedSpecies({ scopeIdentity: researchScopeIdentity(dashboard), species });
    setSelectedNav("Species Explorer");
  }, [dashboard]);
  const focusCurrentSpecies = useCallback((species: string) => {
    setFocusedSpecies({ scopeIdentity: researchScopeIdentity(dashboard), species });
  }, [dashboard]);
  const confirmOpenAiRequest = useCallback(
    (action: string) =>
      new Promise<boolean>((resolve) => {
        setOpenAiConfirmRequest({ action, resolve });
      }),
    []
  );
  const resolveOpenAiConfirmRequest = useCallback((confirmed: boolean) => {
    setOpenAiConfirmRequest((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);
  const activeBatchIdRef = useRef<number | null>(emptyDashboard.batch?.id ?? null);
  const activeResearchScopeRef = useRef(researchScopeIdentity(emptyDashboard));

  const refreshSpeciesResearchCacheStatus = useCallback(async (batchId: number | undefined, scopeIdentity: string) => {
    if (!window.seedbank || !batchId) return;
    try {
      const status = await window.seedbank.getSpeciesResearchCacheStatus(batchId);
      setDashboard((current) => {
        if (
          current.batch?.id !== status.batchId ||
          researchScopeIdentity(current) !== scopeIdentity ||
          status.scopeHash !== scopeIdentity
        ) return current;
        return { ...current, speciesResearchCacheStatus: status };
      });
    } catch {
      setDashboard((current) => {
        if (current.batch?.id !== batchId || researchScopeIdentity(current) !== scopeIdentity) return current;
        return { ...current, speciesResearchCacheStatus: null };
      });
    }
  }, []);

  const applyDashboard = useCallback((next: DashboardData) => {
    const nextBatchId = next.batch?.id ?? null;
    const nextScopeIdentity = researchScopeIdentity(next);
    if (activeResearchScopeRef.current !== nextScopeIdentity) {
      setSpeciesResearchResults({});
      setSpeciesResearchErrors({});
      setResearchingSpecies(null);
    }
    activeBatchIdRef.current = nextBatchId;
    activeResearchScopeRef.current = nextScopeIdentity;
    setDashboard(next);
    if (next.batch?.id) void refreshSpeciesResearchCacheStatus(next.batch.id, nextScopeIdentity);
  }, [refreshSpeciesResearchCacheStatus]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.seedbank) return;
      const [status, current, datasetState, treatmentCodebook] = await Promise.all([
        window.seedbank.getOpenAiStatus(),
        window.seedbank.getDashboard(),
        window.seedbank.getDataset?.() ?? Promise.resolve({ sources: [], scopes: [], activeScopeId: null }),
        window.seedbank.getTreatmentCodebook?.() ?? Promise.resolve([])
      ]);
      if (cancelled) return;
      setAiConfigured(status.configured);
      setSafeStorageAvailable(status.safeStorageAvailable);
      setDataset(datasetState);
      setCodebook(treatmentCodebook);
      applyDashboard(current);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyDashboard]);

  const bestComparison = dashboard.pairedComparisons[0];
  const donePercent = Math.round(dashboard.metrics.doneRate * 100);
  const batchLabel = dashboard.scope
    ? `${dashboard.scope.name} · ${dashboard.scope.isCombined ? `${dashboard.scope.batchIds.length} cohorts` : "individual cohort"}`
    : dashboard.batch?.filename ?? "No workbook imported";
  const busy = loading || savingKey;
  const databaseInsight = useMemo(() => {
    if (!dashboard.batch) return "No workbook imported — import propagation data to begin.";
    if (dashboard.scope?.requiresReprocessing) return "This scope needs a parser refresh before formal analysis.";
    if (dashboard.dataQualityIssues.length) {
      return `${pluralize(dashboard.dataQualityIssues.length, "data-quality warning")} · ${pluralize(dashboard.metrics.trials, "trial row", "trial rows")} · ${pluralize(dashboard.metrics.species, "species", "species")}.`;
    }
    if (bestComparison) {
      return `${pluralize(dashboard.metrics.trials, "trial row", "trial rows")} · ${pluralize(dashboard.metrics.species, "species", "species")} · best paired signal: ${bestComparison.treatment} vs ${bestComparison.baseline}.`;
    }
    return `${pluralize(dashboard.metrics.trials, "trial row", "trial rows")} · ${pluralize(dashboard.metrics.species, "species", "species")} · ${pluralize(dashboard.metrics.treatments, "treatment string")} in scope.`;
  }, [
    bestComparison,
    dashboard.batch,
    dashboard.dataQualityIssues.length,
    dashboard.metrics.species,
    dashboard.metrics.treatments,
    dashboard.metrics.trials,
    dashboard.scope?.requiresReprocessing
  ]);
  const operationalMessage = message && message !== USER_CANCELLED_REQUEST_MESSAGE ? message : null;
  const metricCards = useMemo(
    () => [
      {
        label: "Trial rows",
        value: dashboard.metrics.trials,
        detail: pluralize(dashboard.metrics.accessions, "accession")
      },
      {
        label: "Species",
        value: dashboard.metrics.species,
        detail: pluralize(dashboard.metrics.treatments, "treatment string")
      },
      {
        label: "Done rate",
        value: `${donePercent}%`,
        detail: "D vs ND status"
      },
      {
        label: "Parsed observations",
        value: dashboard.metrics.observationsExtracted,
        detail: "from PCD and notes"
      }
    ],
    [
      dashboard.metrics.accessions,
      dashboard.metrics.observationsExtracted,
      dashboard.metrics.species,
      dashboard.metrics.treatments,
      dashboard.metrics.trials,
      donePercent
    ]
  );

  async function importWorkbook() {
    if (!window.seedbank || busy) return;
    setLoading(true);
    setMessage("Reading selected workbooks for compatibility preview...");
    try {
      const previews = await window.seedbank.previewWorkbooks();
      if (previews.length) {
        setImportPreviews(previews);
        setSelectedNav("Imports");
        setMessage(`Previewed ${previews.length} workbook${previews.length === 1 ? "" : "s"}; review before importing.`);
      } else {
        setMessage("Preview canceled.");
      }
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Import failed."));
    } finally {
      setLoading(false);
    }
  }

  async function commitImportPreviews() {
    if (!window.seedbank || busy || !importPreviews.length) return;
    setLoading(true);
    setMessage("Creating reviewed immutable workbook versions...");
    try {
      const response = await window.seedbank.commitImportPreviews(importPreviews.map((preview) => preview.token));
      setDataset(response.dataset);
      applyDashboard(response.dashboard);
      setImportPreviews([]);
      setMessage("Imports committed. The active analysis scope was not changed.");
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Import commit failed."));
    } finally {
      setLoading(false);
    }
  }

  async function checkWorkbookUpdate(sourceId: number) {
    if (!window.seedbank || busy) return;
    setLoading(true);
    try {
      const preview = await window.seedbank.checkWorkbookUpdate(sourceId);
      setImportPreviews([preview]);
      setMessage(preview.requiresReprocessing ? "The source is unchanged, but a parser refresh is ready for review." : preview.unchangedSourceId ? "The synced file is unchanged." : "A changed workbook version is ready for review.");
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to check the workbook."));
    } finally {
      setLoading(false);
    }
  }

  async function relinkWorkbookSource(sourceId: number) {
    if (!window.seedbank || busy) return;
    setLoading(true);
    try {
      const preview = await window.seedbank.relinkWorkbookSource(sourceId);
      if (preview) {
        setImportPreviews([preview]);
        setMessage("Replacement file selected. Review it and import to commit the relink.");
      } else {
        setMessage("Relink canceled.");
      }
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to relink the workbook source."));
    } finally {
      setLoading(false);
    }
  }

  async function selectPreviewWorksheet(token: string, worksheetName: string) {
    if (!window.seedbank || busy) return;
    setLoading(true);
    try {
      const preview = await window.seedbank.selectPreviewWorksheet(token, worksheetName);
      setImportPreviews((current) => current.map((candidate) => (candidate.token === token ? preview : candidate)));
      setMessage(`Rebuilt the preview using worksheet ${preview.worksheetName}. Review the accepted and quarantined rows before importing.`);
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to select the worksheet."));
    } finally {
      setLoading(false);
    }
  }

  async function selectAnalysisScope(scopeId: number) {
    if (!window.seedbank || busy || !scopeId) return;
    setLoading(true);
    try {
      const response = await window.seedbank.setAnalysisScope(scopeId);
      setDataset(response.dataset);
      applyDashboard(response.dashboard);
      setMessage(`Active analysis scope: ${response.dashboard.scope?.name ?? "selected cohort"}.`);
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to select analysis scope."));
    } finally {
      setLoading(false);
    }
  }

  async function createCombinedScope() {
    if (!window.seedbank || busy) return;
    const batchIds = dataset.sources.map((source) => source.latestBatchId).filter((id): id is number => id !== null);
    if (batchIds.length < 2) return;
    setLoading(true);
    try {
      const response = await window.seedbank.createAnalysisScope("Combined latest cohorts", batchIds);
      setDataset(response.dataset);
      applyDashboard(response.dashboard);
      setMessage("Combined scope created and selected explicitly.");
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to create combined scope."));
    } finally {
      setLoading(false);
    }
  }

  async function saveCodebookEntry(entry: Omit<TreatmentCodebookEntry, "id" | "builtIn">) {
    if (!window.seedbank || busy) return;
    setLoading(true);
    try {
      const response = await window.seedbank.saveTreatmentCodebookEntry(entry);
      setCodebook(response.entries);
      setDataset(response.dataset);
      applyDashboard(response.dashboard);
      setMessage("Treatment codebook version saved and eligibility was recalculated for the active scope.");
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to save the codebook entry."));
    } finally {
      setLoading(false);
    }
  }

  async function exportAdvancedAnalysis() {
    if (!window.seedbank || busy) return;
    if (!dashboard.scope) {
      setMessage("Select an analysis scope before exporting Advanced Analysis files.");
      setSelectedNav("Imports");
      return;
    }
    if (dashboard.scope.requiresReprocessing) {
      setMessage("Refresh this imported scope before exporting Advanced Analysis files.");
      setSelectedNav("Imports");
      return;
    }
    if (!(dashboard.advancedComparisons ?? []).length) {
      setMessage("No completed, documented paired contrasts are eligible for Advanced Analysis export in this scope.");
      return;
    }
    setLoading(true);
    try {
      const result = await window.seedbank.exportAdvancedAnalysis();
      setMessage(result ? `Exported pair, species, and manifest files to ${result.directory}.` : "Export canceled.");
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Advanced analysis export failed."));
    } finally {
      setLoading(false);
    }
  }

  async function saveOpenAiKey() {
    if (!window.seedbank || !apiKeyInput.trim() || busy) return;
    const requestedBatchId = dashboard.batch?.id ?? null;
    setSavingKey(true);
    setMessage("Saving OpenAI key...");
    try {
      const status = await window.seedbank.saveOpenAiKey(apiKeyInput.trim(), requestedBatchId ?? undefined);
      setAiConfigured(status.configured);
      setSafeStorageAvailable(status.safeStorageAvailable);
      if (status.dashboard) {
        const responseBatchId = status.dashboard.batch?.id ?? null;
        const activeBatchId = activeBatchIdRef.current;
        if (requestedBatchId !== activeBatchId || (requestedBatchId !== null && responseBatchId !== activeBatchId)) {
          setMessage("OpenAI key saved. A newer workbook is active, so older dashboard state was not displayed.");
          setApiKeyInput("");
          setSettingsOpen(false);
          return;
        }
        applyDashboard(status.dashboard);
        if (status.dashboard.batch) {
          setMessage("OpenAI key saved. Ask and Species Explorer research are ready for this import.");
        } else {
          setMessage("OpenAI key saved. Import a workbook to use AI features.");
        }
      } else {
        setMessage("OpenAI key saved. Import a workbook to use AI features.");
      }
      setApiKeyInput("");
      setSettingsOpen(false);
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to save OpenAI key."));
    } finally {
      setSavingKey(false);
    }
  }

  const researchSpecies = useCallback(
    async (species: string, force = false) => {
      const requestedBatchId = activeBatchIdRef.current;
      const requestedScopeIdentity = activeResearchScopeRef.current;
      const key = researchKey(requestedScopeIdentity, species);
      if (!window.seedbank || requestedBatchId === null || researchingSpeciesRef.current === key) return;
      researchingSpeciesRef.current = key;
      setResearchingSpecies(key);
      setSpeciesResearchErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMessage(
        force
          ? `Refreshing source-backed germination research for ${species}...`
          : `Running source-backed germination research for ${species}...`
      );
      try {
        const cacheStatus = dashboard.speciesResearchCacheStatus;
        const hasCachedResearch =
          Boolean(cacheStatus?.totalSpecies) && !new Set(cacheStatus?.missingSpecies ?? []).has(species);
        const needsOpenAiConfirmation = aiConfigured && (force || !hasCachedResearch);
        if (needsOpenAiConfirmation) {
          const confirmed = await confirmOpenAiRequest(`source-backed research for ${species}`);
          if (!confirmed) {
            setSpeciesResearchErrors((current) => ({ ...current, [key]: USER_CANCELLED_REQUEST_MESSAGE }));
            setMessage(USER_CANCELLED_REQUEST_MESSAGE);
            return;
          }
        }
        const result = await window.seedbank.researchSpecies(requestedBatchId, species, force, true);
        if (activeBatchIdRef.current !== requestedBatchId || activeResearchScopeRef.current !== requestedScopeIdentity) {
          setMessage("Species research completed for a prior analysis scope, but a newer scope is active.");
          return;
        }
        setSpeciesResearchResults((current) => ({ ...current, [key]: result }));
        void refreshSpeciesResearchCacheStatus(requestedBatchId, requestedScopeIdentity);
        setMessage(
          result.status === "no_sources"
            ? `No valid AI technique survived for ${species}; local evidence remains available as an audit trail.`
            : `Research assessment ready for ${species}.`
        );
      } catch (error) {
        if (isUserCancelledRequest(error)) {
          setSpeciesResearchErrors((current) => ({ ...current, [key]: USER_CANCELLED_REQUEST_MESSAGE }));
          setMessage(USER_CANCELLED_REQUEST_MESSAGE);
          return;
        }
        const detail = humanizeErrorMessage(error, "Unable to research this species.");
        setSpeciesResearchErrors((current) => ({ ...current, [key]: detail }));
        setMessage(detail);
      } finally {
        setResearchingSpecies((current) => {
          if (current === key) {
            researchingSpeciesRef.current = null;
            return null;
          }
          return current;
        });
      }
    },
    [aiConfigured, confirmOpenAiRequest, dashboard.speciesResearchCacheStatus, refreshSpeciesResearchCacheStatus]
  );

  async function clearOpenAiKey() {
    if (!window.seedbank || busy) return;
    const requestedBatchId = dashboard.batch?.id ?? null;
    setSavingKey(true);
    researchingSpeciesRef.current = null;
    setResearchingSpecies(null);
    try {
      const status = await window.seedbank.clearOpenAiKey(requestedBatchId ?? undefined);
      setAiConfigured(status.configured);
      setSafeStorageAvailable(status.safeStorageAvailable);
      if (status.dashboard) {
        if (requestedBatchId !== activeBatchIdRef.current) {
          setMessage("OpenAI key cleared. A newer workbook is active, so older dashboard state was not displayed.");
          setApiKeyInput("");
          return;
        }
        applyDashboard(status.dashboard);
      }
      setApiKeyInput("");
      setMessage("OpenAI key cleared. The app remains fully local.");
    } catch (error) {
      setMessage(humanizeErrorMessage(error, "Unable to clear OpenAI key."));
    } finally {
      setSavingKey(false);
    }
  }

  const hero = (
    <section className="hero-strip">
      <div
        className="hero-media"
        role="img"
        aria-label="Seed bank workbench with seed packets and germination plates"
        style={{ backgroundImage: `url(${seedbankWorkbench})` }}
      />
      <div className="hero-copy">
        <span>{databaseInsight}</span>
        <strong>
          {bestComparison
            ? `${bestComparison.treatment} vs ${bestComparison.baseline}: ${bestComparison.confidence}`
            : "Import evidence to compare treatments"}
        </strong>
        <p>
          Paired trials are prioritized, rare results are replication-labeled, and underpowered findings stay visible
          instead of being mistaken for failures.
        </p>
      </div>
    </section>
  );

  const metrics = (
    <section className="metrics-grid">
      {metricCards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </section>
  );

  const overview = (
    <section className="overview-grid">
      <article className="overview-card">
        <span>Best analyzed paired comparison</span>
        <strong>
          {bestComparison
            ? `${bestComparison.treatment} vs ${bestComparison.baseline}`
            : "No paired comparison yet"}
        </strong>
        <p>
          {bestComparison
            ? `${bestComparison.confidence}; n=${bestComparison.n}, mean PC lift ${bestComparison.meanDiff}.`
            : "Import paired control and treatment rows to compare methods."}
        </p>
        <button type="button" onClick={() => setSelectedNav("Treatment Comparator")}>
          Open comparator
        </button>
      </article>

      <article className="overview-card">
        <span>Species-local evidence</span>
        <strong>{(dashboard.speciesTreatmentEffects ?? []).filter((effect) => effect.outcome === "completed").length} matched results</strong>
        <p>Start with the completed, accession-matched treatment result for the species in front of you.</p>
        <button type="button" onClick={() => setSelectedNav("Species Explorer")}>
          Open Species Explorer
        </button>
      </article>

      <article className="overview-card">
        <span>Quality checks</span>
        <strong>{dashboard.dataQualityIssues.length} warnings</strong>
        <p>Review missing fields, underpowered comparisons, and false-positive or false-negative risk.</p>
        <button type="button" onClick={() => setSelectedNav("Data Quality")}>
          Open Data Quality
        </button>
      </article>

      <article className="overview-card">
        <span>Operational follow-up</span>
        <strong>{dashboard.trialQueue.length} queued rows</strong>
        <p>Work the ND rows, missing production checks, and next observations separately from analysis.</p>
        <button type="button" onClick={() => setSelectedNav("Trial Queue")}>
          Open Trial Queue
        </button>
      </article>
    </section>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src={appIcon} alt="" />
          <div>
            <strong>SeedBank</strong>
            <span>Insights</span>
          </div>
        </div>
        <nav aria-label="Application sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={selectedNav === item.label ? "active" : ""}
                aria-label={item.label}
                aria-current={selectedNav === item.label ? "page" : undefined}
                key={item.label}
                type="button"
                onClick={() => setSelectedNav(item.label)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="psu-sidebar-badge" aria-label="Portland State University">
          <img src={psuSignature} alt="Portland State University" />
        </div>
        <div className="sidebar-note">
          <Microscope size={18} />
          <span>PSU-style propagation evidence, local-first.</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{selectedNav}</h1>
            <p>{batchLabel}</p>
          </div>
          <div className="topbar-actions">
            <button className="primary" type="button" onClick={importWorkbook} disabled={busy}>
              <FileSpreadsheet size={17} />
              Import spreadsheet
            </button>
            <button type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)} disabled={busy}>
              <Settings2 size={18} />
            </button>
          </div>
        </header>

        {operationalMessage ? (
          <div className="workspace-status" role="status">
            {operationalMessage}
          </div>
        ) : null}

        {selectedNav === "Imports" && (
          <DatasetManager
            dataset={dataset}
            previews={importPreviews}
            codebook={codebook}
            busy={busy}
            onPreview={importWorkbook}
            onCommit={commitImportPreviews}
            onCheckUpdate={checkWorkbookUpdate}
            onRelink={relinkWorkbookSource}
            onSelectWorksheet={selectPreviewWorksheet}
            onSelectScope={selectAnalysisScope}
            onCreateCombinedScope={createCombinedScope}
            onSaveCodebook={saveCodebookEntry}
          />
        )}

        {selectedNav === "Insight Board" && (
          <>
            {hero}
            {metrics}
            <SpeciesResultsOverview
              effects={dashboard.speciesTreatmentEffects ?? []}
              codebook={codebook}
              onOpenSpecies={openSpeciesExplorer}
            />
            {overview}
          </>
        )}

        {selectedNav === "Species Explorer" && (
          <SpeciesExplorer
            dashboard={dashboard}
            aiConfigured={aiConfigured}
            actionDisabled={busy}
            codebook={codebook}
            focusedSpecies={focusedSpecies}
            researchResults={speciesResearchResults}
            researchErrors={speciesResearchErrors}
            researchingSpecies={researchingSpecies}
            onResearchSpecies={researchSpecies}
            onFocusSpecies={focusCurrentSpecies}
          />
        )}

        {selectedNav === "Treatment Comparator" && (
          <section className="view-grid two-column">
            <PairedComparisonPanel comparisons={dashboard.pairedComparisons} />
            <TreatmentChart summaries={dashboard.treatmentSummaries} />
          </section>
        )}

        {selectedNav === "Advanced Analysis" && (
          <AdvancedAnalysis
            dashboard={dashboard}
            busy={busy}
            onExport={exportAdvancedAnalysis}
            onOpenImports={() => setSelectedNav("Imports")}
          />
        )}

        {selectedNav === "Trial Queue" && (
          <section className="view-stack">
            <TrialQueueTable rows={dashboard.trialQueue} />
          </section>
        )}

        {selectedNav === "Data Quality" && (
          <section className="view-stack">
            <DataQualityPanel issues={dashboard.dataQualityIssues} comparisons={dashboard.pairedComparisons} />
          </section>
        )}

        {selectedNav === "Ask" && (
          <section className="view-stack">
            <AskPanel dashboard={dashboard} aiConfigured={aiConfigured} onConfirmOpenAiRequest={confirmOpenAiRequest} />
          </section>
        )}

        {selectedNav === "Glossary" && <TreatmentGlossaryPanel dashboard={dashboard} codebook={codebook} />}

        {selectedNav === "Help" && <HelpPanel />}
      </main>

      <SettingsModal
        open={settingsOpen}
        apiKeyInput={apiKeyInput}
        safeStorageAvailable={safeStorageAvailable}
        aiConfigured={aiConfigured}
        saving={busy}
        onClose={closeSettings}
        onInput={setApiKeyInput}
        onSave={saveOpenAiKey}
        onClear={clearOpenAiKey}
      />
      <OpenAiConfirmModal request={openAiConfirmRequest} onResolve={resolveOpenAiConfirmRequest} />
    </div>
  );
}

export default App;
