export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p>{title}</p>
      {hint && <span>{hint}</span>}
    </div>
  );
}
