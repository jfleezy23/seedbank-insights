import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BrainCircuit,
  Database,
  FileSpreadsheet,
  FlaskConical,
  KeyRound,
  Leaf,
  MessageSquareText,
  Microscope,
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
import type { DashboardData } from "./core/types";
import { sampleDashboard } from "./data/sampleDashboard";
import "./App.css";

const navItems = [
  { label: "Imports", icon: FileSpreadsheet },
  { label: "Insight Board", icon: BarChart3 },
  { label: "Species Explorer", icon: Leaf },
  { label: "Treatment Comparator", icon: FlaskConical },
  { label: "Trial Queue", icon: Database },
  { label: "Data Quality", icon: AlertCircle },
  { label: "Ask", icon: MessageSquareText }
] as const;

type NavLabel = (typeof navItems)[number]["label"];

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

function SpeciesExplorer({
  dashboard,
  aiConfigured,
  generatingSpeciesInsights,
  actionDisabled,
  onGenerateSpeciesInsights
}: {
  dashboard: DashboardData;
  aiConfigured: boolean;
  generatingSpeciesInsights: boolean;
  actionDisabled: boolean;
  onGenerateSpeciesInsights: () => void;
}) {
  const hasBatch = Boolean(dashboard.batch);
  const hasInsights = dashboard.speciesInsights.length > 0;
  const canGenerate = aiConfigured && hasBatch && !actionDisabled;
  const emptyTitle = !hasBatch
    ? "Import a workbook before generating species insights."
    : !aiConfigured
      ? "Add an OpenAI key in Settings to generate species insights."
      : generatingSpeciesInsights
        ? "Generating species insights from the imported workbook..."
        : "Generate AI species insights for this import.";

  return (
    <section className="view-stack">
      <section className="panel species-insights-panel">
        <div className="panel-heading">
          <div>
            <h2>Species insights</h2>
            <p>{dashboard.aiInsightStatus.message}</p>
          </div>
          <div className="species-actions">
            <AiStatusPill dashboard={dashboard} />
            {aiConfigured && hasBatch ? (
              <button type="button" onClick={onGenerateSpeciesInsights} disabled={!canGenerate}>
                <BrainCircuit size={16} />
                {generatingSpeciesInsights
                  ? "Generating..."
                  : hasInsights
                    ? "Regenerate insights"
                    : "Generate species insights"}
              </button>
            ) : null}
          </div>
        </div>
        {dashboard.speciesInsights.length ? (
          <div className="species-insight-grid">
            {dashboard.speciesInsights.map((insight) => (
              <article className="species-card" key={insight.species}>
                <div className="species-card-heading">
                  <div>
                    <strong>{insight.species}</strong>
                    <span>{insight.model ?? "deterministic"}</span>
                  </div>
                  <ConfidenceBadge label={insight.deterministicConfidence} />
                </div>
                <p>{insight.summary}</p>
                <ul>
                  {insight.keyFindings.slice(0, 3).map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
                <div className="evidence-list">
                  {insight.evidence.slice(0, 3).map((evidence) => (
                    <span key={`${insight.species}-${evidence.sourceRow}-${evidence.treatment}`}>
                      Row {evidence.sourceRow}: {evidence.treatment} - {evidence.observation}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BrainCircuit size={22} />
            <strong>{emptyTitle}</strong>
            <span>Deterministic species summaries remain available below.</span>
          </div>
        )}
      </section>

      <section className="panel species-table-panel">
        <div className="panel-heading">
          <div>
            <h2>Deterministic species summary</h2>
            <p>Counts and confidence labels are computed locally.</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Species</th>
              <th>Rows</th>
              <th>Treatments</th>
              <th>Best treatment</th>
              <th>Mean PC</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.speciesSummaries.slice(0, 24).map((summary) => (
              <tr key={summary.species}>
                <td>
                  <strong>{summary.species}</strong>
                </td>
                <td>{summary.rows}</td>
                <td>{summary.treatments}</td>
                <td>{summary.bestTreatment ?? "None yet"}</td>
                <td>{summary.bestPcMean === null ? "-" : summary.bestPcMean.toFixed(1)}</td>
                <td>
                  <ConfidenceBadge label={summary.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [dashboard, setDashboard] = useState<DashboardData>(sampleDashboard);
  const [selectedNav, setSelectedNav] = useState<NavLabel>("Insight Board");
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [safeStorageAvailable, setSafeStorageAvailable] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [generatingSpeciesInsights, setGeneratingSpeciesInsights] = useState(false);
  const [message, setMessage] = useState("Sample data loaded. Import the PSU workbook for live analysis.");
  const activeBatchIdRef = useRef<number | null>(sampleDashboard.batch?.id ?? null);

  function applyDashboard(next: DashboardData) {
    activeBatchIdRef.current = next.batch?.id ?? null;
    setDashboard(next);
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
  const busy = loading || savingKey || generatingSpeciesInsights;

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

  async function runSpeciesInsightGeneration(requestedBatchId: number, force: boolean, existingInsights: boolean) {
    if (!window.seedbank) return;
    setGeneratingSpeciesInsights(true);
    setSelectedNav("Species Explorer");
    setMessage(existingInsights ? "Regenerating cached species insights..." : "Generating species insights from the current import...");
    try {
      const next = await window.seedbank.generateSpeciesInsights(force, requestedBatchId);
      if ((next.batch?.id ?? null) !== activeBatchIdRef.current) {
        setMessage("Generated species insights for the prior workbook, but a newer import is active.");
        return;
      }
      applyDashboard(next);
      setAiConfigured(next.aiInsightStatus.configured);
      setMessage(next.aiInsightStatus.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate species insights.");
    } finally {
      setGeneratingSpeciesInsights(false);
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
          if (status.dashboard.speciesInsights.length) {
            setMessage("OpenAI key saved. Ask is ready, and cached species insights are available.");
          } else {
            setMessage("OpenAI key saved. Ask is ready, and species insights can be generated for this import.");
          }
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

  async function generateSpeciesInsights() {
    const requestedBatchId = dashboard.batch?.id ?? null;
    if (requestedBatchId === null || busy) return;
    await runSpeciesInsightGeneration(requestedBatchId, dashboard.speciesInsights.length > 0, dashboard.speciesInsights.length > 0);
  }

  async function clearOpenAiKey() {
    if (!window.seedbank || busy) return;
    const requestedBatchId = dashboard.batch?.id ?? null;
    setSavingKey(true);
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
      <img src={seedbankWorkbench} alt="Seed bank workbench with seed packets and germination plates" />
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
            <section className="dashboard-grid">
              <PairedComparisonPanel comparisons={dashboard.pairedComparisons} />
              <TreatmentChart summaries={dashboard.treatmentSummaries} />
              <DataQualityPanel issues={dashboard.dataQualityIssues} comparisons={dashboard.pairedComparisons} />
              <TrialQueueTable rows={dashboard.trialQueue} />
              <AskPanel dashboard={dashboard} aiConfigured={aiConfigured} />
            </section>
          </>
        )}

        {selectedNav === "Species Explorer" && (
          <SpeciesExplorer
            dashboard={dashboard}
            aiConfigured={aiConfigured}
            generatingSpeciesInsights={generatingSpeciesInsights}
            actionDisabled={busy}
            onGenerateSpeciesInsights={generateSpeciesInsights}
          />
        )}

        {selectedNav === "Treatment Comparator" && (
          <section className="view-grid two-column">
            <PairedComparisonPanel comparisons={dashboard.pairedComparisons} />
            <TreatmentChart summaries={dashboard.treatmentSummaries} />
            <DataQualityPanel issues={dashboard.dataQualityIssues} comparisons={dashboard.pairedComparisons} />
          </section>
        )}

        {selectedNav === "Trial Queue" && (
          <section className="view-stack">
            {metrics}
            <TrialQueueTable rows={dashboard.trialQueue} />
          </section>
        )}

        {selectedNav === "Data Quality" && (
          <section className="view-grid two-column">
            <DataQualityPanel issues={dashboard.dataQualityIssues} comparisons={dashboard.pairedComparisons} />
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Guardrail status</h2>
                  <p>These checks slow down false positives and false negatives.</p>
                </div>
              </div>
              <div className="quality-summary-list">
                <span>Trial rows: {dashboard.metrics.trials}</span>
                <span>Species: {dashboard.metrics.species}</span>
                <span>Parsed observations: {dashboard.metrics.observationsExtracted}</span>
                <span>Done rate: {donePercent}%</span>
              </div>
            </section>
          </section>
        )}

        {selectedNav === "Ask" && (
          <section className="view-stack">
            <AskPanel dashboard={dashboard} aiConfigured={aiConfigured} />
          </section>
        )}
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
