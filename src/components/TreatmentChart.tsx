import type { TreatmentSummary } from "../core/types";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface TreatmentChartProps {
  summaries: TreatmentSummary[];
}

function scaleMaximum(summary: TreatmentSummary): number {
  if (summary.pcScale === "percent_0_100") return 100;
  if (summary.pcScale === "mixed" || summary.pcScale === "ambiguous") {
    return (summary.pcMean ?? 0) > 5 ? 100 : 5;
  }
  return 5;
}

function barWidth(summary: TreatmentSummary): number {
  const maximum = scaleMaximum(summary);
  return Math.min(100, Math.max(3, ((summary.pcMean ?? 0) / maximum) * 100));
}

function scoreLabel(summary: TreatmentSummary): string {
  if (summary.pcScale === "percent_0_100") return `${(summary.pcMean ?? 0).toFixed(1)}%`;
  if (summary.pcScale === "mixed") return `${(summary.pcMean ?? 0).toFixed(1)} mixed`;
  return (summary.pcMean ?? 0).toFixed(1);
}

export function TreatmentChart({ summaries }: TreatmentChartProps) {
  const leadingConfidence = summaries.find((summary) => summary.pcMean !== null)?.confidence ?? "Inconclusive";
  const hasPercentScale = summaries.some(
    (summary) => summary.pcScale === "percent_0_100" || summary.pcScale === "mixed" || (summary.pcMean ?? 0) > 5
  );
  const data = summaries
    .filter((summary) => summary.pcMean !== null)
    .map((summary) => ({
      treatment: summary.treatment,
      propaguleType: summary.propaguleType,
      pcScale: summary.pcScale,
      score: scoreLabel(summary),
      width: barWidth(summary)
    }));

  return (
    <section className="panel treatment-chart">
      <div className="panel-heading">
        <div>
          <h2>Treatment score overview</h2>
          <p>PC scores keep their recorded scale. Effect size first, sample size always visible.</p>
        </div>
        <div className="evidence-tier">
          <span>Evidence tier</span>
          <ConfidenceBadge label={leadingConfidence} />
        </div>
      </div>
      <div className="native-chart" role="img" aria-label="Treatment score overview by mean PC score">
        {data.map((row) => (
          <div
            className="native-chart-row"
            key={`${row.propaguleType ?? "unknown"}-${row.treatment}-${row.pcScale ?? "unscaled"}`}
          >
            <span>{row.treatment}</span>
            <div className="native-chart-track">
              <div
                className="native-chart-bar"
                style={{ width: `${row.width}%` }}
              />
            </div>
            <strong>{row.score}</strong>
          </div>
        ))}
      </div>
      <div className="native-chart-axis" aria-hidden="true">
        <span>0</span>
        <span>Mean PC score</span>
        <span>{hasPercentScale ? "100" : "5"}</span>
      </div>
    </section>
  );
}
