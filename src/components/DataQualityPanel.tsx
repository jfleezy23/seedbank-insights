import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { DataQualityIssue, PairedComparison } from "../core/types";

export function DataQualityPanel({
  issues,
  comparisons
}: {
  issues: DataQualityIssue[];
  comparisons: PairedComparison[];
}) {
  const underpowered = comparisons.filter(
    (comparison) => comparison.confidence === "Inconclusive" || comparison.confidence === "Needs replication"
  );

  return (
    <section className="panel guardrail-panel">
      <div className="panel-heading">
        <div>
          <h2>Data quality warnings</h2>
          <p>Missing fields, underpowered comparisons, and evidence limits that can distort conclusions.</p>
        </div>
      </div>
      <div className="guardrail-list">
        <article>
          <AlertTriangle size={18} />
          <div>
            <strong>False positive risk</strong>
            <span>One-off high scores and rare treatment strings stay labeled as replication needs.</span>
          </div>
        </article>
        <article>
          <AlertTriangle size={18} />
          <div>
            <strong>Underpowered comparison</strong>
            <span>
              {underpowered.length
                ? `${underpowered.length} comparisons need more paired trials before a firm call.`
                : "Current paired comparisons clear the minimum power gate."}
            </span>
          </div>
        </article>
        <article>
          <CheckCircle2 size={18} />
          <div>
            <strong>Deterministic evidence</strong>
            <span>AI can summarize, but cannot promote confidence labels or hide warnings.</span>
          </div>
        </article>
      </div>

      <div className="issue-list">
        {issues.slice(0, 5).map((issue) => (
          <article key={`${issue.title}-${issue.affectedRows}`} className={`issue ${issue.severity}`}>
            <strong>{issue.title}</strong>
            <span>{issue.detail}</span>
            <small>{issue.affectedRows} affected</small>
          </article>
        ))}
      </div>
    </section>
  );
}
