type StatCardProps = {
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
};

export function StatCard({ label, value, subValue, color }: StatCardProps) {
  return (
    <div className="card">
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color }}>
        {value}
      </p>
      {subValue && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
          {subValue}
        </p>
      )}
    </div>
  );
}
