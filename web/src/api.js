export async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error?.message || 'Request failed'), {
        status: res.status, code: data.error?.code, details: data.error?.details,
      });
    }
    return data;
  }