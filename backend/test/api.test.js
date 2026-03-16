import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── helpers ────────────────────────────────────────────────────────────────────
const BASE = 'http://localhost:3001';

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// ── shared state ───────────────────────────────────────────────────────────────
let tokenA, tokenB, userA, userB;
let tripId, inviteCode, photoId;

// ── auth ───────────────────────────────────────────────────────────────────────
test('POST /auth/register — creates user A', async () => {
  const { status, body } = await api('POST', '/auth/register', { name: 'Alice' });
  assert.equal(status, 200);
  assert.ok(body.token);
  assert.equal(body.user.name, 'Alice');
  tokenA = body.token;
  userA = body.user;
});

test('POST /auth/register — creates user B', async () => {
  const { status, body } = await api('POST', '/auth/register', { name: 'Bob' });
  assert.equal(status, 200);
  tokenB = body.token;
  userB = body.user;
});

test('POST /auth/register — rejects empty name', async () => {
  const { status } = await api('POST', '/auth/register', { name: '' });
  assert.equal(status, 400);
});

test('GET /auth/me — returns current user', async () => {
  const { status, body } = await api('GET', '/auth/me', null, tokenA);
  assert.equal(status, 200);
  assert.equal(body.id, userA.id);
});

test('GET /auth/me — rejects without token', async () => {
  const { status } = await api('GET', '/auth/me');
  assert.equal(status, 401);
});

// ── trips ──────────────────────────────────────────────────────────────────────
test('POST /trips — creates trip', async () => {
  const { status, body } = await api('POST', '/trips', {
    name: 'Baikal 2025',
    start_date: '2025-07-12',
    end_date: '2025-07-18',
  }, tokenA);
  assert.equal(status, 201);
  assert.equal(body.name, 'Baikal 2025');
  assert.ok(body.invite_code);
  tripId = body.id;
  inviteCode = body.invite_code;
});

test('POST /trips — rejects missing fields', async () => {
  const { status } = await api('POST', '/trips', { name: 'No Dates' }, tokenA);
  assert.equal(status, 400);
});

test('GET /trips — lists trips for user', async () => {
  const { status, body } = await api('GET', '/trips', null, tokenA);
  assert.equal(status, 200);
  assert.ok(body.some(t => t.id === tripId));
});

test('GET /trips/:id — returns trip', async () => {
  const { status, body } = await api('GET', `/trips/${tripId}`, null, tokenA);
  assert.equal(status, 200);
  assert.equal(body.id, tripId);
});

test('GET /trips/:id — rejects non-member', async () => {
  const { status } = await api('GET', `/trips/${tripId}`, null, tokenB);
  assert.equal(status, 404);
});

test('POST /trips/join/:code — user B joins via invite', async () => {
  const { status, body } = await api('POST', `/trips/join/${inviteCode}`, {}, tokenB);
  assert.equal(status, 200);
  assert.equal(body.id, tripId);
});

test('GET /trips/:id/members — shows both members', async () => {
  const { status, body } = await api('GET', `/trips/${tripId}/members`, null, tokenA);
  assert.equal(status, 200);
  assert.equal(body.length, 2);
  const names = body.map(m => m.name);
  assert.ok(names.includes('Alice'));
  assert.ok(names.includes('Bob'));
});

// ── photos ─────────────────────────────────────────────────────────────────────
test('GET /trips/:id/photos — empty list initially', async () => {
  const { status, body } = await api('GET', `/trips/${tripId}/photos`, null, tokenA);
  assert.equal(status, 200);
  assert.equal(body.length, 0);
});

test('GET /trips/:id/photos — rejects non-member', async () => {
  const { status } = await api('GET', `/trips/${tripId}/photos`, null,
    (await api('POST', '/auth/register', { name: 'Eve' })).body.token
  );
  assert.equal(status, 403);
});

// ── comments ───────────────────────────────────────────────────────────────────
test('POST /photos/:id/comments — rejects empty text', async () => {
  // Use a fake UUID just to test validation
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { status } = await api('POST', `/photos/${fakeId}/comments`, { text: '' }, tokenA);
  assert.equal(status, 400);
});

// ── health ─────────────────────────────────────────────────────────────────────
test('GET /health — returns ok', async () => {
  const { status, body } = await api('GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
});
