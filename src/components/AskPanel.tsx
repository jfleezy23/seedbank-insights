import { BrainCircuit, KeyRound } from "lucide-react";
import type { DashboardData } from "../core/types";

export function AskPanel({
  dashboard,
  aiConfigured
}: {
  dashboard: DashboardData;
  aiConfigured: boolean;
}) {
  const strongest = dashboard.pairedComparisons[0];
  const answer = strongest
    ? `${strongest.treatment} vs ${strongest.baseline} is the highest-ranked paired comparison currently available: n=${strongest.n}, mean PC lift ${strongest.meanDiff}, confidence ${strongest.confidence}. ${strongest.falsePositiveRisk}`
    : "Import a workbook to ask deterministic evidence questions.";

  return (
    <section className="panel ask-panel">
      <div className="panel-heading">
        <div>
          <h2>Ask with deterministic evidence</h2>
          <p>Queries run locally first. OpenAI can polish the wording when configured.</p>
        </div>
        <span className={aiConfigured ? "ai-state configured" : "ai-state"}>
          {aiConfigured ? <BrainCircuit size={16} /> : <KeyRound size={16} />}
          {aiConfigured ? "AI ready" : "AI optional"}
        </span>
      </div>
      <div className="ask-box">
        <label htmlFor="ask-input">Question</label>
        <input
          id="ask-input"
          value="Which technique has the strongest evidence, and where are we underpowered?"
          readOnly
        />
        <p>{answer}</p>
      </div>
      <div className="suggestions">
        {dashboard.askSuggestions.map((suggestion) => (
          <button key={suggestion} type="button">
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
