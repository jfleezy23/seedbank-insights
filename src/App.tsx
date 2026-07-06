import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Database,
  FileSpreadsheet,
  FlaskConical,
  Leaf,
  MessageSquareText,
  Microscope,
  Search,
  Settings2
} from "lucide-react";
import seedbankWorkbench from "../assets/branding/seedbank-workbench.png";
import appIcon from "../assets/branding/app-icon.svg";
import { AskPanel } from "./components/AskPanel";
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
];

function App() {
  const [dashboard, setDashboard] = useState<DashboardData>(sampleDashboard);
  const [selectedNav, setSelectedNav] = useState("Insight Board");
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [message, setMessage] = useState("Sample data loaded. Import the PSU workbook for live analysis.");

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
      if (current.batch) {
        setDashboard(current);
        setMessage(`Loaded ${current.batch.filename} from local SQLite.`);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const bestComparison = dashboard.pairedComparisons[0];
  const donePercent = Math.round(dashboard.metrics.doneRate * 100);
  const batchLabel = dashboard.batch?.filename ?? "No workbook imported";

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
    setLoading(true);
    setMessage("Importing workbook and recomputing deterministic insights...");
    try {
      const next = await window.seedbank?.selectWorkbook();
      if (next) {
        setDashboard(next);
        setMessage(`Imported ${next.batch?.filename ?? "workbook"}.`);
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
    setLoading(true);
    setMessage("Looking for P_accessions_new.xlsx in the repo...");
    try {
      const next = await window.seedbank?.importLocalDefaultWorkbook();
      if (next) {
        setDashboard(next);
        setMessage(`Imported ${next.batch?.filename ?? "local workbook"}.`);
      } else {
        setMessage("No local default workbook found.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Local import failed.");
    } finally {
      setLoading(false);
    }
  }

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
            <button type="button" onClick={importLocalDefault} disabled={loading}>
              <Search size={17} />
              Load local workbook
            </button>
            <button className="primary" type="button" onClick={importWorkbook} disabled={loading}>
              <FileSpreadsheet size={17} />
              Import spreadsheet
            </button>
            <button type="button" aria-label="Settings">
              <Settings2 size={18} />
            </button>
          </div>
        </header>

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
              Paired trials are prioritized, rare results are replication-labeled, and underpowered findings stay
              visible instead of being mistaken for failures.
            </p>
          </div>
        </section>

        <section className="metrics-grid">
          {metricCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </section>

        <section className="dashboard-grid">
          <PairedComparisonPanel comparisons={dashboard.pairedComparisons} />
          <TreatmentChart summaries={dashboard.treatmentSummaries} />
          <DataQualityPanel issues={dashboard.dataQualityIssues} comparisons={dashboard.pairedComparisons} />
          <TrialQueueTable rows={dashboard.trialQueue} />
          <AskPanel dashboard={dashboard} aiConfigured={aiConfigured} />
        </section>
      </main>
    </div>
  );
}

export default App;
