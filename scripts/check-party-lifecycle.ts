import "../apps/api/src/config/env.js";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { prisma } from "../packages/db/src/index.js";
import type { PartySnapshot } from "../packages/shared/src/party.js";

const base = "http://localhost:4000/api";
const prefix = `qa-party-${randomUUID()}`;
const ids = [`${prefix}-a`, `${prefix}-b`];
const sessions: string[] = [];
const streams: AbortController[] = [];
let code: string | undefined;
async function request(path: string, token?: string, body?: unknown) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}
try {
  const { hash } = createRequire(new URL("../apps/api/package.json", import.meta.url))("bcryptjs") as { hash(value: string, rounds: number): Promise<string> };
  for (const [index, id] of ids.entries()) {
    const password = randomBytes(20).toString("base64url");
    await prisma.user.create({ data: { id, email: `${id}@example.invalid`, displayName: `Room QA ${index + 1}`, passwordHash: await hash(password, 10), trialUntil: index === 0 ? new Date(Date.now() + 3_600_000) : null, notifyPush: false, notifyTelegram: false } });
    sessions.push((await request("/auth/login", undefined, { email: `${id}@example.invalid`, password })).token);
  }
  code = (await request("/party", sessions[0], { animeId: 21, episode: 1, visibility: "link" })).code;
  for (const token of sessions) {
    const controller = new AbortController(); streams.push(controller);
    const response = await fetch(`${base}/party/${code}/events`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    let greeting = "";
    const decoder = new TextDecoder();
    while (!greeting.includes('"hello"') && greeting.length < 64_000) {
      const chunk = await reader.read();
      if (chunk.done) break;
      greeting += decoder.decode(chunk.value, { stream: true });
    }
    assert.ok(greeting.includes('"hello"'));
    // Retain the connection, with a bounded amount of SSE buffered during this short test.
    void (async () => { try { while (!(await reader.read()).done) { /* drain */ } } catch { /* test cleanup */ } })();
  }
  const joined = await request(`/party/${code}`, sessions[1]) as PartySnapshot;
  assert.equal(joined.members.length, 2);
  const left = await request(`/party/${code}/leave`, sessions[0], {});
  assert.equal(left.closed, false);
  const remaining = await request(`/party/${code}`, sessions[1]) as PartySnapshot;
  assert.equal(remaining.hostId, ids[1]);
  assert.equal(remaining.members.length, 1);
  // A free member who inherits control can still pause/seek for everyone.
  await request(`/party/${code}/playback`, sessions[1], { episode: 1, playing: false, position: 42 });
  const updated = await request(`/party/${code}`, sessions[1]) as PartySnapshot;
  assert.equal(updated.playback.position, 42);
  console.log(JSON.stringify({ joined: 2, creatorLeave: "room retained", host: "transferred to free member", controls: "working", externalNotifications: 0 }));
} finally {
  if (code) for (const token of sessions) await request(`/party/${code}/leave`, token, {}).catch(() => undefined);
  for (const controller of streams) controller.abort();
  await prisma.user.deleteMany({ where: { id: { in: ids }, email: { endsWith: "@example.invalid" } } });
  await prisma.$disconnect();
}
