import type { PairedComparison } from "../core/types";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function PairedComparisonPanel({ comparisons }: { comparisons: PairedComparison[] }) {
  const primary = comparisons[0];
  return (
    <section className="panel paired-panel">
      <div className="panel-heading">
        <div>
          <h2>Paired trials first</h2>
          <p>Same accession/species, different treatment. This is the default evidence tier.</p>
        </div>
        {primary ? <ConfidenceBadge label={primary.confidence} /> : null}
      </div>

      {primary ? (
        <div className="comparison-grid">
          <div className="comparison-score">
            <span>{primary.treatment} vs {primary.baseline}</span>
            <strong>{primary.meanDiff > 0 ? "+" : ""}{primary.meanDiff}</strong>
            <small>mean PC lift, n={primary.n}, CI {primary.ciLow} to {primary.ciHigh}</small>
          </div>
          <div className="direction-bars" aria-label="Comparison direction counts">
            <span style={{ "--bar": `${(primary.improved / primary.n) * 100}%` } as React.CSSProperties}>
              Improved {primary.improved}
            </span>
            <span style={{ "--bar": `${(primary.tied / primary.n) * 100}%` } as React.CSSProperties}>
              Tied {primary.tied}
            </span>
            <span style={{ "--bar": `${(primary.worse / primary.n) * 100}%` } as React.CSSProperties}>
              Worse {primary.worse}
            </span>
          </div>
        </div>
      ) : (
        <p>No paired comparisons available yet.</p>
      )}

      <div className="comparison-list">
        {comparisons.map((comparison) => (
          <article key={`${comparison.baseline}-${comparison.treatment}`} className="comparison-row">
            <div>
              <strong>{comparison.treatment} vs {comparison.baseline}</strong>
              <span>
                n={comparison.n} · improved {comparison.improved} · tied {comparison.tied} · worse {comparison.worse}
              </span>
            </div>
            <div>
              <b>{comparison.meanDiff > 0 ? "+" : ""}{comparison.meanDiff}</b>
              <ConfidenceBadge label={comparison.confidence} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
