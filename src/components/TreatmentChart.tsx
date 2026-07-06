import type { TreatmentSummary } from "../core/types";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface TreatmentChartProps {
  summaries: TreatmentSummary[];
}

export function TreatmentChart({ summaries }: TreatmentChartProps) {
  const leadingConfidence = summaries.find((summary) => summary.pcMean !== null)?.confidence ?? "Inconclusive";
  const data = summaries
    .filter((summary) => summary.pcMean !== null)
    .slice(0, 8)
    .map((summary) => ({
      treatment: summary.treatment,
      pcMean: summary.pcMean ?? 0,
      pcCount: summary.pcCount,
      confidence: summary.confidence
    }));

  return (
    <section className="panel treatment-chart">
      <div className="panel-heading">
        <div>
          <h2>Treatment success</h2>
          <p>Ordinal PC scores. Effect size first, sample size always visible.</p>
        </div>
        <ConfidenceBadge label={leadingConfidence} />
      </div>
      <div className="native-chart" role="img" aria-label="Treatment success by mean PC score">
        {data.map((row) => (
          <div className="native-chart-row" key={row.treatment}>
            <span>{row.treatment}</span>
            <div className="native-chart-track">
              <div
                className="native-chart-bar"
                style={{ width: `${Math.max(3, (row.pcMean / 5) * 100)}%` }}
              />
            </div>
            <strong>{row.pcMean.toFixed(1)}</strong>
          </div>
        ))}
      </div>
      <div className="native-chart-axis" aria-hidden="true">
        <span>0</span>
        <span>Mean PC score</span>
        <span>5</span>
      </div>
    </section>
  );
}
