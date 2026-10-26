const BOUNDS = [1, 2, 5, 10, 15, 20, 25, 50, 100, 250, Infinity];
const LABELS = ['≤1', '≤2', '≤5', '≤10', '≤15', '≤20', '≤25', '≤50', '≤100', '≤250', '>250'];
const minutes = new Map(); 

export function record(ms, status) {
  const m = Math.floor(Date.now() / 60000);
  let b = minutes.get(m);
  if (!b) {
    b = { count: 0, h: new Array(BOUNDS.length).fill(0), s: {} };
    minutes.set(m, b);
    for (const k of minutes.keys()) if (k < m - 1440) minutes.delete(k);   // keep 24h
  }
  b.count++;
  b.h[BOUNDS.findIndex(x => ms <= x)]++;
  b.s[status] = (b.s[status] || 0) + 1;
}

export function summarize(windowMin) {
  const now = Math.floor(Date.now() / 60000);
  const hist = new Array(BOUNDS.length).fill(0);
  const statuses = {};
  const per = [];
  let count = 0;
  for (let m = now - windowMin + 1; m <= now; m++) {
    const b = minutes.get(m);
    per.push(b ? b.count : 0);
    if (!b) continue;
    count += b.count;
    b.h.forEach((v, i) => { hist[i] += v; });
    for (const [s, c] of Object.entries(b.s)) statuses[s] = (statuses[s] || 0) + c;
  }
  const pct = p => {
    if (!count) return null;
    let c = 0;
    for (let i = 0; i < hist.length; i++) {
      c += hist[i];
      if (c >= p * count) return BOUNDS[i] === Infinity ? 250 : BOUNDS[i];
    }
    return null;
  };
  const size = Math.ceil(per.length / 30);
  const series = [];
  for (let i = 0; i < per.length; i += size) series.push({ n: per.slice(i, i + size).reduce((a, b) => a + b, 0) });
  return {
    count, rps_avg: count / (windowMin * 60), peak_rpm: Math.max(0, ...per),
    p50: pct(0.5), p95: pct(0.95), p99: pct(0.99),
    statuses, histogram: LABELS.map((bucket, i) => ({ bucket, count: hist[i] })), series,
  };
}