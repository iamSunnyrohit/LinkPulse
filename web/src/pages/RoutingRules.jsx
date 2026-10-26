import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'];

function withUtm(base, utm) {
  try {
    const u = new URL(base);
    for (const k of UTM_KEYS) utm[k] ? u.searchParams.set(k, utm[k]) : u.searchParams.delete(k);
    return u.toString();
  } catch { return base; }
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso), p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function RoutingRules() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: links, isLoading, error } = useQuery({ queryKey: ['links'], queryFn: () => api('/links') });
  const [dest, setDest] = useState('');
  const [utm, setUtm] = useState({});
  const [expires, setExpires] = useState('');
  const [msg, setMsg] = useState('');

  const link = links?.find(l => l.id === params.get('link')) ?? links?.[0];

  useEffect(() => {
    if (!link) return;
    let base = link.destination_url; const found = {};
    try {
      const u = new URL(base);
      for (const k of UTM_KEYS) { found[k] = u.searchParams.get(k) ?? ''; u.searchParams.delete(k); }
      base = u.toString();
    } catch {}
    setDest(base); setUtm(found); setExpires(toLocalInput(link.expires_at)); setMsg('');
  }, [link?.id, link?.destination_url, link?.expires_at]);

  const patch = useMutation({
    mutationFn: body => api(`/links/${link.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      ['links', 'link', 'overview'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      setMsg('Saved. The redirect cache was invalidated.');
    },
    onError: e => setMsg(Object.values(e.details?.fieldErrors ?? {}).flat()[0] || e.message),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Couldn't load links.</p>;
  if (!links.length) return <p>No links yet. <Link to="/new">Create one</Link>.</p>;

  const finalUrl = withUtm(dest, utm);
  const expiresChanged = expires !== toLocalInput(link.expires_at);

  function save() {
    const body = { destination_url: finalUrl };
    if (expiresChanged) body.expires_at = expires ? new Date(expires).toISOString() : null;
    patch.mutate(body);
  }

  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Routing rules</h1>
        <select value={link.id} onChange={e => setParams({ link: e.target.value })}>
          {links.map(l => <option key={l.id} value={l.id}>/{l.short_code}</option>)}
        </select>
      </div>

      <div className="two" style={{ marginTop: 16 }}>
        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Core link attributes</h3>
            <label>Destination URL
              <input value={dest} onChange={e => setDest(e.target.value)} />
            </label>
            <div className="row">
              <label style={{ flex: 1 }}>Short code (immutable)
                <input value={link.short_code} disabled />
              </label>
              <label style={{ flex: 1 }}>Redirect type
                <input value="302 Found (temporary)" disabled />
              </label>
            </div>
            <p className="muted">302 is fixed so destination changes take effect for future visits.</p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>UTM builder</h3>
            <div className="row">
              {UTM_KEYS.map(k => (
                <label key={k} style={{ flex: 1, minWidth: 140 }}>{k}
                  <input value={utm[k] ?? ''} onChange={e => setUtm({ ...utm, [k]: e.target.value })} />
                </label>
              ))}
            </div>
            <div className="k">Calculated destination</div>
            <code className="url">{finalUrl}</code>
            <button style={{ marginTop: 8 }} onClick={() => navigator.clipboard.writeText(finalUrl)}>Copy</button>
          </div>

          <div className="card disabled">
            <h3 style={{ marginTop: 0 }}>Device and geo routing <span className="pill">Planned</span></h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              Redirecting by country, iOS or Android is outside the MVP scope and is not enabled.</p>
          </div>
        </div>

        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Lifecycle and expiry</h3>
            <p><span className={`pill ${link.status}`}>{link.status}</span></p>
            <label>Expires (your local time)
              <input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} />
            </label>
            <div className="row">
              <button onClick={() => setExpires('')}>Remove expiration</button>
            </div>
            <p className="muted">After expiry visitors get a 410 page.</p>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />
            <div className="k">Kill switch</div>
            {link.status === 'blocked'
              ? <p className="muted">Blocked by an administrator. Only an admin can lift this.</p>
              : <button onClick={() => patch.mutate({ is_active: link.status === 'inactive' })}>
                  {link.status === 'inactive' ? 'Reactivate link' : 'Deactivate link'}</button>}
          </div>

          <div className="card">
            <button className="primary" disabled={patch.isPending} onClick={save}>
              {patch.isPending ? 'Saving…' : 'Save changes'}</button>{' '}
            <a className="btn" href={link.short_url} target="_blank" rel="noreferrer">Test redirect</a>
            {msg && <p className="muted">{msg}</p>}
            <p className="muted"><Link to={`/links/${link.id}`}>View analytics →</Link></p>
          </div>
        </div>
      </div>
    </>
  );
}