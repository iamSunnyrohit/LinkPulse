const n = v => Number(v ?? 0).toLocaleString();

export default function Breakdown({ title, rows }) {
  const max = Math.max(1, ...rows.map(r => r.clicks));
  return (
    <div>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted">No data</p> : rows.map(r => (
        <div key={r.value} style={{ marginBottom: 10 }}>
          <div className="row between" style={{ margin: 0 }}>
            <span>{r.value === 'unknown' ? 'Unknown / direct' : r.value}</span><b>{n(r.clicks)}</b>
          </div>
          <div className="bar"><i style={{ width: `${(r.clicks / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}