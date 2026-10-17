import { PARTY_DEFAULT_SETTINGS } from "@animeshadow/shared";
import type { Room } from "./party.service.js";

export function encodeRoom(room: Room) {
  const now = Date.now();
  const playback = { ...room.playback, position: room.playback.position + (room.playback.playing ? (now - room.playback.updatedAt) / 1000 : 0), updatedAt: now };
  return {
    version: 1 as const, code: room.code, settings: room.settings, anime: room.anime,
    hostId: room.hostId, creatorId: room.creatorId, connectedOnce: room.connectedOnce,
    official: room.official, name: room.name, durationSeconds: room.durationSeconds, nextVotes: [...room.nextVotes],
    availableEpisodes: room.availableEpisodes,
    playback, chat: room.chat.slice(-120), people: [...room.people.values()], createdAt: room.createdAt,
    emptySince: room.emptySince, hostGoneAt: room.hostGoneAt,
    muted: [...room.muted], banned: [...room.banned],
    queue: [...room.queue].map(([id, value]) => ({ id, ...value, votes: [...value.votes] })),
    titles: [...room.titles], messages: room.messages, reactions: room.reactions, peak: room.peak,
  };
}

/** Restore data only: old HTTP streams and buffering states never survive a restart. */
export function decodeRoom(value: unknown): Room | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as ReturnType<typeof encodeRoom>;
  if (saved.version !== 1 || typeof saved.code !== "string" || !/^[\w-]{4,16}$/.test(saved.code)
    || !saved.anime?.id || !saved.hostId || !saved.creatorId || !Array.isArray(saved.people)
    || !Array.isArray(saved.chat) || !Number.isFinite(saved.createdAt)
    || !Number.isFinite(saved.playback?.position) || !Number.isFinite(saved.playback?.episode)) return null;
  try {
    const now = Date.now();
    return {
      ...saved, settings: { ...PARTY_DEFAULT_SETTINGS, ...saved.settings },
      official: saved.official === true, name: saved.name ?? null, durationSeconds: saved.durationSeconds ?? null,
      playback: saved.official ? saved.playback : { ...saved.playback, playing: false, updatedAt: now, waitingFor: null },
      nextVotes: new Set(saved.nextVotes ?? []),
      availableEpisodes: saved.availableEpisodes ?? [],
      people: new Map(saved.people.map((person) => [person.id, person])),
      streams: new Map(), emptySince: saved.official ? null : saved.emptySince ?? now,
      hostGoneAt: saved.official ? null : now, muted: new Set(saved.muted), banned: new Set(saved.banned),
      queue: new Map(saved.queue.map(({ id, ...item }) => [id, { ...item, votes: new Set(item.votes) }])),
      titles: new Map(saved.titles), chat: saved.chat.slice(-120),
      lastReaction: new Map(), net: new Map(), loading: new Set(), autoPaused: false, watched: new Map(), countedAt: now, membersSoon: null,
    };
  } catch { return null; }
}
