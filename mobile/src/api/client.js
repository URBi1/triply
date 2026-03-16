import { getToken, clearAuth } from '../store/auth';

export const API_URL = 'https://triply-api.onrender.com';

// Called by App.js to handle global logout (token expired / server reset)
let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

async function request(method, path, body, isMultipart = false) {
  const token = await getToken();
  const headers = {};

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !isMultipart) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isMultipart ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    await clearAuth();
    _onUnauthorized?.();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get:    (path)         => request('GET',    path),
  post:   (path, body)   => request('POST',   path, body),
  upload: (path, form)   => request('POST',   path, form, true),
};
