import { randomUUID } from 'node:crypto';
const email = `qa-${randomUUID()}@example.invalid`;
const password = `Qa!${randomUUID()}aA1`;
const base = 'http://127.0.0.1:4000/api';
const send = (path, body, token, method = 'POST') => fetch(base + path, {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
});
let token;
try {
  const result = await send('/auth/register', { email, password, displayName: 'QA signup', acceptTerms: true });
  const session = await result.json();
  token = session.token;
  if (result.status !== 201 || !token || !session.user) throw new Error(`Direct signup failed: ${result.status} ${JSON.stringify(session.error ?? {})}`);
  if (session.user.emailVerified) throw new Error('Unconfirmed email was marked verified');
  const me = await send('/auth/me', undefined, token, 'GET');
  const duplicate = await send('/auth/register', { email, password, displayName: 'QA signup', acceptTerms: true });
  const login = await send('/auth/login', { email, password });
  console.log(JSON.stringify({ signup: result.status, session: me.status, duplicate: duplicate.status, login: login.status, emailVerified: session.user.emailVerified }));
  if (me.status !== 200 || duplicate.status !== 409 || login.status !== 200) throw new Error('Signup regression');
} finally {
  if (token) {
    const cleanup = await send('/auth/me', { password }, token, 'DELETE');
    console.log(JSON.stringify({ testAccountCleanup: cleanup.status }));
    if (cleanup.status !== 204) throw new Error('Test account cleanup failed');
  }
}
