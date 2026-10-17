export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="statValue">{value}</span>
      <span className="statLabel">{label}</span>
    </div>
  );
}
