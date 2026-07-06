interface MetricCardProps {
  label: string;
  value: string | number;
  detail: string;
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <section className="metric-card" aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
