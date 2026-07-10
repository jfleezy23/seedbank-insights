import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BrainCircuit,
  CircleHelp,
  Database,
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
import { buildSpeciesResourceLinks } from "./core/speciesResources";
import type { DashboardData, SpeciesResearchResult, SpeciesSummary } from "./core/types";
import "./App.css";

const navItems = [
  { label: "Imports", icon: FileSpreadsheet },
  { label: "Insight Board", icon: BarChart3 },
  { label: "Species Explorer", icon: Leaf },
  { label: "Treatment Comparator", icon: FlaskConical },
  { label: "Trial Queue", icon: Database },
  { label: "Data Quality", icon: AlertCircle },
  { label: "Ask", icon: MessageSquareText },
  { label: "Help", icon: CircleHelp }
] as const;

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
  pairedComparisons: [],
  trialQueue: [],
  dataQualityIssues: [],
  askSuggestions: [],
  speciesInsights: [],
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

function deterministicSpeciesRead(summary: SpeciesSummary | undefined): string {
  if (!summary) return "Select a species to inspect its propagation evidence.";
  const treatment = summary.bestTreatment ?? "No treatment has enough PC data yet";
  const mean = summary.bestPcMean === null ? "" : ` with mean PC ${summary.bestPcMean.toFixed(1)}`;
  if (summary.confidence === "Needs replication") {
    return `${summary.species} has ${summary.rows} row${summary.rows === 1 ? "" : "s"} across ${summary.treatments} treatment${summary.treatments === 1 ? "" : "s"}. ${treatment}${mean}; keep this as a hypothesis until more accessions repeat it.`;
  }
  if (summary.confidence === "Inconclusive") {
    return `${summary.species} has some treatment coverage, but PC or follow-up observations are too thin for a directional call. ${treatment}${mean}.`;
  }
  return `${summary.species} is worth closer attention: ${treatment}${mean} is the current local leader, with ${summary.pcCount} PC score${summary.pcCount === 1 ? "" : "s"} available.`;
}

function deterministicTrialDesign(summary: SpeciesSummary | undefined): string {
  if (!summary) return "Import data to build a species-specific trial plan.";
  if (summary.accessions < 3 || summary.treatments < 2) {
    return "Add paired control and candidate-treatment trays across at least three accessions before recommending a protocol.";
  }
  if (summary.pcCount < summary.rows) {
    return "Prioritize missing PC and production follow-up before adding more treatment variants.";
  }
  return "Repeat the current best treatment against control and the nearest alternative, then track liner and 4-inch survival.";
}

function researchKey(batchId: number | undefined, species: string): string {
  return `${batchId ?? "sample"}:${species.toLowerCase()}`;
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

function SpeciesExplorer({
  dashboard,
  aiConfigured,
  actionDisabled,
  researchResults,
  researchErrors,
  researchingSpecies,
  onResearchSpecies
}: {
  dashboard: DashboardData;
  aiConfigured: boolean;
  actionDisabled: boolean;
  researchResults: Record<string, SpeciesResearchResult>;
  researchErrors: Record<string, string>;
  researchingSpecies: string | null;
  onResearchSpecies: (species: string, force?: boolean) => void;
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
  const filteredSpeciesOptions = useMemo(() => {
    const query = speciesFilter.trim().toLocaleLowerCase();
    if (!query) return speciesOptions;
    return speciesOptions.filter((option) => option.species.toLocaleLowerCase().includes(query));
  }, [speciesFilter, speciesOptions]);
  const emptyTitle = !hasBatch
    ? "Import a workbook before researching species."
    : !aiConfigured
      ? "Load cached AI research or add an OpenAI key to generate it."
      : "Select a species to run AI protocol research.";
  useEffect(() => {
    if (!firstSpecies) return;
    if (!speciesOptions.some((option) => option.species === selectedSpecies)) {
      setSelectedSpecies(firstSpecies);
    }
  }, [firstSpecies, selectedSpecies, speciesOptions]);

  const selectedSummary =
    dashboard.speciesSummaries.find((summary) => summary.species === selectedSpecies) ?? speciesOptions[0]?.summary;
  const activeSpecies = selectedSummary?.species ?? selectedSpecies;
  const selectedLinks = activeSpecies ? buildSpeciesResourceLinks(activeSpecies) : [];
  const cacheMissingSpecies = useMemo(
    () => new Set(dashboard.speciesResearchCacheStatus?.missingSpecies ?? []),
    [dashboard.speciesResearchCacheStatus?.missingSpecies]
  );
  const hasCacheStatus = Boolean(dashboard.speciesResearchCacheStatus?.totalSpecies);
  const activeResearchKey = researchKey(dashboard.batch?.id, activeSpecies);
  const selectedResearch = researchResults[activeResearchKey];
  const selectedResearchError = researchErrors[activeResearchKey];
  const isResearching = researchingSpecies === activeSpecies;
  const cachedResearchAvailable = hasCacheStatus && !cacheMissingSpecies.has(activeSpecies);
  const canResearch =
    hasBatch &&
    Boolean(activeSpecies) &&
    !actionDisabled &&
    !isResearching &&
    (aiConfigured || Boolean(selectedResearch) || cachedResearchAvailable);

  useEffect(() => {
    if (!hasBatch || !activeSpecies || selectedResearch || selectedResearchError || isResearching) return;
    if (!aiConfigured && !cachedResearchAvailable) return;
    onResearchSpecies(activeSpecies, false);
  }, [
    activeSpecies,
    aiConfigured,
    cacheMissingSpecies,
    hasBatch,
    hasCacheStatus,
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
            <h2>AI Research Assessment</h2>
            <p>{dashboard.aiInsightStatus.message}</p>
          </div>
          <div className="species-actions">
            <AiStatusPill dashboard={dashboard} />
            {hasBatch ? (
              <button
                type="button"
                onClick={() => onResearchSpecies(activeSpecies, aiConfigured)}
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
                    onClick={() => setSelectedSpecies(option.species)}
                  >
                    <span>{option.species}</span>
                    <small>
                      {option.summary?.rows ?? 0} rows
                      {researchResults[researchKey(dashboard.batch?.id, option.species)] ||
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
                <section className="species-research-state warning">
                  <AlertCircle size={22} />
                  <div>
                    <h4>Research did not complete</h4>
                    <p>{selectedResearchError}</p>
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

              <details className="local-evidence-details">
                <summary>Local workbook evidence and deterministic guardrails</summary>
                <div className="species-metrics">
                  <span>{selectedSummary?.rows ?? 0} rows</span>
                  <span>{selectedSummary?.accessions ?? 0} accessions</span>
                  <span>{selectedSummary?.treatments ?? 0} treatments</span>
                  <span>{selectedSummary?.pcCount ?? 0} PC scores</span>
                  <span>{selectedSummary?.bestTreatment ?? "No leader"}</span>
                  <span>{selectedSummary?.confidence ?? "No local label"}</span>
                </div>
                <div className="local-evidence-copy">
                  <p>{deterministicSpeciesRead(selectedSummary)}</p>
                  <p>{deterministicTrialDesign(selectedSummary)}</p>
                </div>
                <div className="evidence-list">
                  {(selectedResearch?.localEvidence ?? []).slice(0, 5).map((evidence) => (
                    <span key={`${activeSpecies}-${evidence.sourceRow}-${evidence.treatment}`}>
                      Row {evidence.sourceRow}: {evidence.treatment} - {evidence.observation}
                    </span>
                  ))}
                </div>
              </details>
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
              Workbooks, SQLite data, and AI response cache files stay local. OpenAI keys are stored through Electron
              main using OS safe storage and are not exposed to renderer code.
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
          <span>3. Use Species Explorer for AI-backed germination research on a selected taxon.</span>
          <span>4. Use Data Quality and Trial Queue to fix workbook rows before making protocol decisions.</span>
        </div>
      </section>
    </section>
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
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="panel-heading">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>{safeStorageAvailable ? "OpenAI keys are stored with OS safe storage." : "OS safe storage is unavailable."}</p>
          </div>
          <button type="button" aria-label="Close settings" onClick={onClose}>
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

function App() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [selectedNav, setSelectedNav] = useState<NavLabel>("Insight Board");
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [safeStorageAvailable, setSafeStorageAvailable] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [speciesResearchResults, setSpeciesResearchResults] = useState<Record<string, SpeciesResearchResult>>({});
  const [speciesResearchErrors, setSpeciesResearchErrors] = useState<Record<string, string>>({});
  const [researchingSpecies, setResearchingSpecies] = useState<string | null>(null);
  const [message, setMessage] = useState("Import the PSU workbook to begin.");
  const activeBatchIdRef = useRef<number | null>(emptyDashboard.batch?.id ?? null);

  async function refreshSpeciesResearchCacheStatus(batchId: number | undefined) {
    if (!window.seedbank || !batchId) return;
    try {
      const status = await window.seedbank.getSpeciesResearchCacheStatus(batchId);
      setDashboard((current) => {
        if (current.batch?.id !== status.batchId) return current;
        return { ...current, speciesResearchCacheStatus: status };
      });
    } catch {
      setDashboard((current) => {
        if (current.batch?.id !== batchId) return current;
        return { ...current, speciesResearchCacheStatus: null };
      });
    }
  }

  function applyDashboard(next: DashboardData) {
    const nextBatchId = next.batch?.id ?? null;
    if (activeBatchIdRef.current !== nextBatchId) {
      setSpeciesResearchResults({});
      setSpeciesResearchErrors({});
      setResearchingSpecies(null);
    }
    activeBatchIdRef.current = nextBatchId;
    setDashboard(next);
    if (next.batch?.id) void refreshSpeciesResearchCacheStatus(next.batch.id);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.seedbank) return;
      const [status, current] = await Promise.all([
        window.seedbank.getOpenAiStatus(),
        window.seedbank.getDashboard()
      ]);
      if (cancelled) return;
      setAiConfigured(status.configured);
      setSafeStorageAvailable(status.safeStorageAvailable);
      applyDashboard(current);
      if (current.batch) {
        setMessage(`Loaded ${current.batch.filename} from local SQLite.`);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeBatchIdRef.current = dashboard.batch?.id ?? null;
  }, [dashboard.batch?.id]);

  const bestComparison = dashboard.pairedComparisons[0];
  const donePercent = Math.round(dashboard.metrics.doneRate * 100);
  const batchLabel = dashboard.batch?.filename ?? "No workbook imported";
  const busy = loading || savingKey;
  const researchCacheStatus = dashboard.speciesResearchCacheStatus;
  const activeSessionResearchCount = Object.keys(speciesResearchResults).filter((key) =>
    dashboard.batch?.id ? key.startsWith(`${dashboard.batch.id}:`) : false
  ).length;
  const researchedSpeciesCount = researchCacheStatus?.researchedSpecies ?? activeSessionResearchCount;
  const researchSpeciesTotal = researchCacheStatus?.totalSpecies ?? dashboard.metrics.species;
  const researchCoverageTitle = dashboard.batch
    ? `${researchedSpeciesCount} / ${researchSpeciesTotal} researched species`
    : "Research workbench ready";
  const researchCoverageDetail =
    researchCacheStatus && researchCacheStatus.totalSpecies > 0
      ? researchCacheStatus.missingSpecies.length
        ? `${researchCacheStatus.missingSpecies.slice(0, 3).join(", ")}${
            researchCacheStatus.missingSpecies.length > 3 ? ` +${researchCacheStatus.missingSpecies.length - 3}` : ""
          } still need cached research.`
        : "All imported species have cached AI research for the demo."
      : "Run species-level AI research with local row evidence, family context, caveats, and next-trial design.";
  const metricCards = useMemo(
    () => [
      {
        label: "Trial rows",
        value: dashboard.metrics.trials,
        detail: `${dashboard.metrics.accessions} accessions`
      },
      {
        label: "Species",
        value: dashboard.metrics.species,
        detail: `${dashboard.metrics.treatments} treatment strings`
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
    [dashboard, donePercent]
  );

  async function importWorkbook() {
    if (!window.seedbank || busy) return;
    setLoading(true);
    setMessage("Importing workbook and recomputing deterministic insights...");
    try {
      const next = await window.seedbank.selectWorkbook();
      if (next) {
        applyDashboard(next);
        setAiConfigured(next.aiInsightStatus.configured);
        setMessage(`Imported ${next.batch?.filename ?? "workbook"}. ${next.aiInsightStatus.message}`);
      } else {
        setMessage("Import canceled.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  async function importLocalDefault() {
    if (!window.seedbank || busy) return;
    setLoading(true);
    setMessage("Looking for P_accessions_new.xlsx in the repo...");
    try {
      const next = await window.seedbank.importLocalDefaultWorkbook();
      if (next) {
        applyDashboard(next);
        setAiConfigured(next.aiInsightStatus.configured);
        setMessage(`Imported ${next.batch?.filename ?? "local workbook"}. ${next.aiInsightStatus.message}`);
      } else {
        setMessage("No local default workbook found.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Local import failed.");
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
      setMessage(error instanceof Error ? error.message : "Unable to save OpenAI key.");
    } finally {
      setSavingKey(false);
    }
  }

  const researchSpecies = useCallback(
    async (species: string, force = false) => {
      const requestedBatchId = activeBatchIdRef.current;
      if (!window.seedbank || requestedBatchId === null || researchingSpecies === species) return;
      const key = researchKey(requestedBatchId, species);
      setResearchingSpecies(species);
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
        const result = await window.seedbank.researchSpecies(requestedBatchId, species, force);
        if (activeBatchIdRef.current !== requestedBatchId) {
          setMessage("Species research completed for a prior workbook, but a newer import is active.");
          return;
        }
        setSpeciesResearchResults((current) => ({ ...current, [key]: result }));
        void refreshSpeciesResearchCacheStatus(requestedBatchId);
        setMessage(
          result.status === "no_sources"
            ? `No valid AI technique survived for ${species}; local evidence remains available as an audit trail.`
            : `Research assessment ready for ${species}.`
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unable to research this species.";
        setSpeciesResearchErrors((current) => ({ ...current, [key]: detail }));
        setMessage(detail);
      } finally {
        setResearchingSpecies((current) => (current === species ? null : current));
      }
    },
    [researchingSpecies]
  );

  async function clearOpenAiKey() {
    if (!window.seedbank || busy) return;
    const requestedBatchId = dashboard.batch?.id ?? null;
    setSavingKey(true);
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
      setMessage(error instanceof Error ? error.message : "Unable to clear OpenAI key.");
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
        <span>{message}</span>
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
        <span>Species assessment</span>
        <strong>{researchCoverageTitle}</strong>
        <p>{researchCoverageDetail}</p>
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
            <button type="button" onClick={importLocalDefault} disabled={busy}>
              <Search size={17} />
              Load local workbook
            </button>
            <button className="primary" type="button" onClick={importWorkbook} disabled={busy}>
              <FileSpreadsheet size={17} />
              Import spreadsheet
            </button>
            <button type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)} disabled={busy}>
              <Settings2 size={18} />
            </button>
          </div>
        </header>

        {selectedNav === "Imports" && (
          <section className="view-stack">
            <section className="panel import-panel">
              <div className="panel-heading">
                <div>
                  <h2>Spreadsheet imports</h2>
                  <p>{message}</p>
                </div>
                <AiStatusPill dashboard={dashboard} />
              </div>
              <div className="import-actions">
                <button type="button" onClick={importLocalDefault} disabled={busy}>
                  <Search size={17} />
                  Load local workbook
                </button>
                <button type="button" onClick={importWorkbook} disabled={busy}>
                  <FileSpreadsheet size={17} />
                  Import spreadsheet
                </button>
              </div>
            </section>
            {metrics}
          </section>
        )}

        {selectedNav === "Insight Board" && (
          <>
            {hero}
            {metrics}
            {overview}
          </>
        )}

        {selectedNav === "Species Explorer" && (
          <SpeciesExplorer
            dashboard={dashboard}
            aiConfigured={aiConfigured}
            actionDisabled={busy}
            researchResults={speciesResearchResults}
            researchErrors={speciesResearchErrors}
            researchingSpecies={researchingSpecies}
            onResearchSpecies={researchSpecies}
          />
        )}

        {selectedNav === "Treatment Comparator" && (
          <section className="view-grid two-column">
            <PairedComparisonPanel comparisons={dashboard.pairedComparisons} />
            <TreatmentChart summaries={dashboard.treatmentSummaries} />
          </section>
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
            <AskPanel dashboard={dashboard} aiConfigured={aiConfigured} />
          </section>
        )}

        {selectedNav === "Help" && <HelpPanel />}
      </main>

      <SettingsModal
        open={settingsOpen}
        apiKeyInput={apiKeyInput}
        safeStorageAvailable={safeStorageAvailable}
        aiConfigured={aiConfigured}
        saving={busy}
        onClose={() => setSettingsOpen(false)}
        onInput={setApiKeyInput}
        onSave={saveOpenAiKey}
        onClear={clearOpenAiKey}
      />
    </div>
  );
}

export default App;
