import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Filter } from "lucide-react";
import type { DataQualityIssue, PairedComparison } from "../core/types";

type QualityFilter = "fix_first" | "replication" | "codebook" | "notes";

const filterLabels: Record<QualityFilter, string> = {
  fix_first: "Fix first",
  replication: "Replication",
  codebook: "Codebook",
  notes: "Notes"
};

function issueCategory(issue: DataQualityIssue): QualityFilter {
  if (issue.category === "replication") return "replication";
  if (issue.category === "codebook") return "codebook";
  if (issue.category === "notes") return "notes";
  return "fix_first";
}

function shortList(values: string[] | undefined, empty: string): string {
  if (!values?.length) return empty;
  if (values.length <= 3) return values.join(", ");
  return `${values.slice(0, 3).join(", ")} +${values.length - 3}`;
}

function rowSummary(rows: number[] | undefined): string {
  if (!rows?.length) return "Rows not specified";
  if (rows.length <= 8) return `Rows ${rows.join(", ")}`;
  return `Rows ${rows.slice(0, 8).join(", ")} +${rows.length - 8}`;
}

export function DataQualityPanel({
  issues,
  comparisons
}: {
  issues: DataQualityIssue[];
  comparisons: PairedComparison[];
}) {
  const [activeFilter, setActiveFilter] = useState<QualityFilter>("fix_first");
  const underpowered = comparisons.filter(
    (comparison) => comparison.confidence === "Inconclusive" || comparison.confidence === "Needs replication"
  );
  const counts = useMemo(() => {
    const next: Record<QualityFilter, number> = {
      fix_first: 0,
      replication: underpowered.length,
      codebook: 0,
      notes: 0
    };
    for (const issue of issues) {
      next[issueCategory(issue)] += 1;
    }
    return next;
  }, [issues, underpowered.length]);
  const visibleIssues = issues.filter((issue) => issueCategory(issue) === activeFilter);

  return (
    <section className="panel data-quality-panel">
      <div className="panel-heading">
        <div>
          <h2>Data quality action queue</h2>
          <p>Specific rows, species, and treatment codes to fix before trusting the next insight.</p>
        </div>
      </div>

      <div className="quality-filterbar" aria-label="Data quality filters">
        {(Object.keys(filterLabels) as QualityFilter[]).map((filter) => (
          <button
            type="button"
            className={activeFilter === filter ? "active" : ""}
            key={filter}
            onClick={() => setActiveFilter(filter)}
          >
            <Filter size={14} />
            {filterLabels[filter]}
            <span>{counts[filter]}</span>
          </button>
        ))}
      </div>

      <div className="quality-action-list">
        {activeFilter === "replication" &&
          underpowered.map((comparison) => (
            <article key={`${comparison.baseline}-${comparison.treatment}`} className="quality-action high">
              <div className="quality-action-topline">
                <AlertTriangle size={17} />
                <div>
                  <strong>
                    {comparison.treatment} vs {comparison.baseline} needs more paired trials
                  </strong>
                  <span>
                    n={comparison.n}; {comparison.additionalTrialsNeeded} more paired trial
                    {comparison.additionalTrialsNeeded === 1 ? "" : "s"} estimated before a firmer call.
                  </span>
                </div>
              </div>
              <p>{comparison.falseNegativeRisk}</p>
              <div className="quality-tags">
                <span>{comparison.confidence}</span>
                <span>Mean lift {comparison.meanDiff}</span>
                <span>CI {comparison.ciLow} to {comparison.ciHigh}</span>
              </div>
            </article>
          ))}

        {visibleIssues.map((issue) => (
          <article key={issue.id ?? `${issue.title}-${issue.affectedRows}`} className={`quality-action ${issue.severity}`}>
            <div className="quality-action-topline">
              {issue.severity === "low" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
              <div>
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
              </div>
            </div>
            <p>{issue.impact ?? "Review this issue before turning the affected rows into recommendations."}</p>
            <div className="quality-action-callout">
              <b>Action</b>
              <span>{issue.action ?? "Review affected rows and update the workbook where appropriate."}</span>
            </div>
            <div className="quality-tags">
              <span>{rowSummary(issue.sourceRows)}</span>
              <span>{issue.affectedRows} affected</span>
              <span>{shortList(issue.species, "Species mixed")}</span>
              <span>{shortList(issue.treatments, "Treatment mixed")}</span>
              {issue.metric ? <span>{issue.metric}</span> : null}
            </div>
          </article>
        ))}

        {!visibleIssues.length && !(activeFilter === "replication" && underpowered.length) ? (
          <article className="quality-action empty">
            <div className="quality-action-topline">
              <CheckCircle2 size={17} />
              <div>
                <strong>No {filterLabels[activeFilter].toLowerCase()} items in this import</strong>
                <span>Nothing in this category needs attention right now.</span>
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
