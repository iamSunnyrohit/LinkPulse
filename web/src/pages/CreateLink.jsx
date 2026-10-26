import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';

export default function CreateLink() {
  const [f, setF] = useState({ destination_url: '', custom_alias: '', title: '', expires_at: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErrors({}); setBusy(true);
    const body = { destination_url: f.destination_url };
    if (f.custom_alias) body.custom_alias = f.custom_alias;
    if (f.title) body.title = f.title;
    if (f.expires_at) body.expires_at = new Date(f.expires_at).toISOString();
    try {
      const link = await api('/links', { method: 'POST', body });
      qc.invalidateQueries({ queryKey: ['links'] });
      nav(`/links/${link.id}`);
    } catch (err) {
      if (err.status === 422) setErrors(Object.fromEntries(
        Object.entries(err.details?.fieldErrors ?? {}).map(([k, v]) => [k, v[0]])));
      else if (err.status === 409) setErrors({ custom_alias: 'This alias is already taken' });
      else setErrors({ form: err.message });
    } finally { setBusy(false); }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>New link</h1>
      <label>Destination URL
        <input value={f.destination_url} onChange={set('destination_url')} placeholder="https://example.com/page" required />
        {errors.destination_url && <span className="err">{errors.destination_url}</span>}
      </label>
      <label>Custom alias (optional, case-sensitive)
        <input value={f.custom_alias} onChange={set('custom_alias')} placeholder="my-link" />
        {errors.custom_alias && <span className="err">{errors.custom_alias}</span>}
      </label>
      <label>Title (optional)<input value={f.title} onChange={set('title')} maxLength={120} /></label>
      <label>Expires (optional)
        <input type="datetime-local" value={f.expires_at} onChange={set('expires_at')} />
        {errors.expires_at && <span className="err">{errors.expires_at}</span>}
      </label>
      <p className="muted">Short URL preview: http://localhost:3000/{f.custom_alias || '<generated>'}</p>
      {errors.form && <p role="alert" className="err">{errors.form}</p>}
      <button disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
    </form>
  );
}