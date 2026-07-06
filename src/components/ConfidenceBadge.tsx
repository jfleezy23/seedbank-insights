import type { ConfidenceLabel } from "../core/types";

const CLASS_BY_CONFIDENCE: Record<ConfidenceLabel, string> = {
  "Strong signal": "confidence strong",
  Promising: "confidence promising",
  Inconclusive: "confidence inconclusive",
  "Needs replication": "confidence replication"
};

export function ConfidenceBadge({ label }: { label: ConfidenceLabel }) {
  return <span className={CLASS_BY_CONFIDENCE[label]}>{label}</span>;
}
