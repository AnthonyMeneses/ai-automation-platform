const API_BASE = import.meta.env.VITE_API_URL || '';

const AUTH_EXEMPT = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function getCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

async function refreshSession() {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-csrf-token': getCookie('csrf_token') },
  });
  return res.ok;
}

// All requests carry cookies; state-changing requests carry the CSRF header.
// A 401 triggers one silent refresh + retry before declaring the session dead.
export async function api(path, { method = 'GET', body, retried = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method)) headers['x-csrf-token'] = getCookie('csrf_token');

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !retried && !AUTH_EXEMPT.includes(path)) {
    if (await refreshSession()) {
      return api(path, { method, body, retried: true });
    }
    window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(401, 'Session expired');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`, data && data.details);
  }
  return data;
}
