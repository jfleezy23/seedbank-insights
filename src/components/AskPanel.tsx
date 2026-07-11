import { useState } from "react";
import { BrainCircuit, KeyRound, Send } from "lucide-react";
import { humanizeErrorMessage, USER_CANCELLED_REQUEST_MESSAGE } from "../core/errors";
import type { AskAnswer, DashboardData } from "../core/types";

export function AskPanel({
  dashboard,
  aiConfigured,
  onConfirmOpenAiRequest
}: {
  dashboard: DashboardData;
  aiConfigured: boolean;
  onConfirmOpenAiRequest: (action: string) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState("Which technique has the strongest evidence, and where are we underpowered?");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const strongest = dashboard.pairedComparisons[0];
  const deterministicAnswer = strongest
    ? `${strongest.treatment} vs ${strongest.baseline} is the highest-ranked paired comparison currently available: n=${strongest.n}, mean PC lift ${strongest.meanDiff}, confidence ${strongest.confidence}. ${strongest.falsePositiveRisk}`
    : "Import a workbook to ask deterministic evidence questions.";

  async function askQuestion() {
    if (!aiConfigured || !window.seedbank) return;
    setLoading(true);
    setError(null);
    try {
      const confirmed = await onConfirmOpenAiRequest("an Ask question about the active analysis scope");
      if (!confirmed) {
        setError(USER_CANCELLED_REQUEST_MESSAGE);
        return;
      }
      const next = await window.seedbank.askQuestion(question, true);
      setAnswer(next);
    } catch (caught) {
      setError(humanizeErrorMessage(caught, "OpenAI Ask failed."));
    } finally {
      setLoading(false);
    }
  }

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
      <form
        className="ask-box"
        onSubmit={(event) => {
          event.preventDefault();
          void askQuestion();
        }}
      >
        <label htmlFor="ask-input">Question</label>
        <div className="ask-input-row">
          <input
            id="ask-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={!aiConfigured || loading || question.trim().length < 3}>
            <Send size={16} />
            Ask OpenAI
          </button>
        </div>
        <p>{answer?.answer ?? deterministicAnswer}</p>
        {answer?.caveats.length ? (
          <div className="ask-caveats">
            {answer.caveats.map((caveat) => (
              <span key={caveat}>{caveat}</span>
            ))}
            {answer.citedRows.length ? <small>Rows cited: {answer.citedRows.join(", ")}</small> : null}
          </div>
        ) : null}
        {error ? <p className="ask-error">{error}</p> : null}
      </form>
      <div className="suggestions">
        {dashboard.askSuggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
