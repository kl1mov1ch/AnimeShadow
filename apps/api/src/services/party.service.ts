import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { PrismaClient } from "@animeshadow/db";
import {
  PARTY_MAX,
  type PartyChatMessage,
  type PartyEvent,
  type PartyMember,
  type PartyPlayback,
  type PartySnapshot,
} from "@animeshadow/shared";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Room {
  code: string;
  anime: PartySnapshot["anime"];
  hostId: string;
  playback: PartyPlayback;
  chat: PartyChatMessage[];
  /** Who has been in, by id — the ten places. */
  people: Map<string, Person>;
  /** Open event streams: one per tab. */
  streams: Map<string, { personId: string; res: ServerResponse }>;
  createdAt: number;
  emptySince: number | null;
  /** The last reaction per person, to keep a finger on the button from flooding the room. */
  lastReaction: Map<string, number>;
}

const CHAT_KEEP = 120;
/** An empty room is closed after this. */
const EMPTY_TTL = 30 * 60_000;
/** And no room lives longer than this. */
const MAX_AGE = 12 * 3_600_000;

/**
 * Watching together. A room is an anime, an episode and where playback is;
 * up to ten signed-in people, a chat and reactions. Everything lives in
 * memory (one API process): a room is a few kilobytes and closes itself
 * half an hour after the last person leaves.
 *
 * The room hears from its people by plain POSTs and talks to them over one
 * server-sent event stream per tab — ordinary HTTP, through the proxy as is.
 * Playback is "where it was, and since when": every player works out the
 * present position itself, so nothing has to tick on the server.
 */
export class PartyService {
  private rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaClient) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  async create(userId: string, animeId: number, episode: number): Promise<{ code: string }> {
    const anime = await this.prisma.anime.findUnique({
      where: { id: animeId },
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true },
    });
    if (!anime) throw new NotFoundError("Аниме не найдено.");
    const person = await this.person(userId);
    let code = "";
    do code = randomBytes(5).toString("base64url").slice(0, 7);
    while (this.rooms.has(code));
    const now = Date.now();
    this.rooms.set(code, {
      code,
      anime,
      hostId: userId,
      playback: { episode, playing: false, position: 0, updatedAt: now, by: userId },
      chat: [this.line(`${person.name} создал(а) комнату. Пригласите друзей по ссылке — до ${PARTY_MAX} человек.`)],
      people: new Map([[userId, person]]),
      streams: new Map(),
      createdAt: now,
      emptySince: now,
      lastReaction: new Map(),
    });
    return { code };
  }

  snapshot(code: string): PartySnapshot {
    const room = this.room(code);
    return {
      code: room.code,
      anime: room.anime,
      hostId: room.hostId,
      members: this.online(room),
      playback: room.playback,
      chat: room.chat.slice(-60),
      now: Date.now(),
    };
  }

  /** A tab joins the room's stream; the first stream of a new person takes one of the ten places. */
  async connect(code: string, userId: string, res: ServerResponse): Promise<() => void> {
    const room = this.room(code);
    const online = new Set([...room.streams.values()].map((s) => s.personId));
    if (!online.has(userId) && online.size >= PARTY_MAX) {
      throw new ForbiddenError(`В комнате уже ${PARTY_MAX} человек.`);
    }
    if (!room.people.has(userId)) room.people.set(userId, await this.person(userId));
    const streamId = randomBytes(6).toString("hex");
    const wasOnline = online.has(userId);
    room.streams.set(streamId, { personId: userId, res });
    room.emptySince = null;
    this.write(res, { type: "hello", party: this.snapshot(code) });
    if (!wasOnline) {
      const me = room.people.get(userId)!;
      this.say(room, `${me.name} присоединился(ась)`);
      this.broadcast(room, { type: "members", members: this.online(room), now: Date.now() });
    }
    const ping = setInterval(() => this.write(res, { type: "ping", now: Date.now() }), 20_000);
    return () => {
      clearInterval(ping);
      room.streams.delete(streamId);
      const still = [...room.streams.values()].some((s) => s.personId === userId);
      if (!still) {
        const me = room.people.get(userId);
        if (me) this.say(room, `${me.name} вышел(ла)`);
        // The host gone: the longest-present person in the room takes over.
        if (room.hostId === userId) {
          const next = [...room.streams.values()][0]?.personId;
          if (next) room.hostId = next;
        }
        this.broadcast(room, { type: "members", members: this.online(room), now: Date.now() });
      }
      if (room.streams.size === 0) room.emptySince = Date.now();
    };
  }

  async playback(
    code: string,
    userId: string,
    input: { animeId?: number | undefined; episode: number; playing: boolean; position: number },
  ): Promise<PartyPlayback> {
    const room = this.member(code, userId);
    // Another title for the whole room: everyone's page follows.
    if (input.animeId != null && input.animeId !== room.anime.id) {
      const anime = await this.prisma.anime.findUnique({
        where: { id: input.animeId },
        select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true },
      });
      if (!anime) throw new NotFoundError("Аниме не найдено.");
      room.anime = anime;
      room.playback = { episode: input.episode, playing: input.playing, position: input.position, updatedAt: Date.now(), by: userId };
      this.broadcast(room, { type: "anime", anime });
      this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
      this.say(room, `${room.people.get(userId)?.name ?? "Кто-то"} включил(а) «${anime.titleLocalized || anime.title}»`);
      return room.playback;
    }
    const before = room.playback;
    room.playback = { episode: input.episode, playing: input.playing, position: input.position, updatedAt: Date.now(), by: userId };
    this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
    const who = room.people.get(userId)?.name ?? "Кто-то";
    if (before.episode !== input.episode) this.say(room, `${who} включил(а) ${input.episode} серию`);
    else if (before.playing && !input.playing) this.say(room, `${who} поставил(а) паузу на ${clock(input.position)}`);
    else if (!before.playing && input.playing && Math.abs(expected(before) - input.position) < 3) this.say(room, `${who} продолжил(а) просмотр`);
    else if (Math.abs(expected(before) - input.position) >= 3) this.say(room, `${who} перемотал(а) на ${clock(input.position)}`);
    return room.playback;
  }

  chat(code: string, userId: string, text: string): PartyChatMessage {
    const room = this.member(code, userId);
    const me = room.people.get(userId)!;
    const message: PartyChatMessage = { id: randomBytes(6).toString("hex"), at: Date.now(), author: me, text };
    this.push(room, message);
    this.broadcast(room, { type: "chat", message });
    return message;
  }

  react(code: string, userId: string, emoji: string): void {
    const room = this.member(code, userId);
    const last = room.lastReaction.get(userId) ?? 0;
    if (Date.now() - last < 400) return;
    room.lastReaction.set(userId, Date.now());
    const me = room.people.get(userId)!;
    this.broadcast(room, { type: "reaction", emoji, by: userId, name: me.name });
  }

  // ---------------------------------------------------------------------------

  private room(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new NotFoundError("Комната закрыта или ссылка неверная.");
    return room;
  }

  /** Only someone with the room open may act in it. */
  private member(code: string, userId: string): Room {
    const room = this.room(code);
    if (![...room.streams.values()].some((s) => s.personId === userId)) throw new BadRequestError("Сначала откройте комнату.");
    return room;
  }

  private async person(userId: string): Promise<Person> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, avatarUrl: true } });
    if (!u) throw new NotFoundError("Пользователь не найден.");
    return { id: u.id, name: u.displayName, avatarUrl: u.avatarUrl };
  }

  private online(room: Room): PartyMember[] {
    const ids = [...new Set([...room.streams.values()].map((s) => s.personId))];
    return ids
      .map((id) => room.people.get(id))
      .filter((p): p is Person => p != null)
      .map((p) => ({ ...p, host: p.id === room.hostId }));
  }

  private line(text: string): PartyChatMessage {
    return { id: randomBytes(6).toString("hex"), at: Date.now(), author: null, text };
  }

  private say(room: Room, text: string) {
    const message = this.line(text);
    this.push(room, message);
    this.broadcast(room, { type: "chat", message });
  }

  private push(room: Room, message: PartyChatMessage) {
    room.chat.push(message);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
  }

  private broadcast(room: Room, event: PartyEvent) {
    for (const { res } of room.streams.values()) this.write(res, event);
  }

  private write(res: ServerResponse, event: PartyEvent) {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const stale = (room.emptySince != null && now - room.emptySince > EMPTY_TTL) || now - room.createdAt > MAX_AGE;
      if (!stale) continue;
      for (const { res } of room.streams.values()) res.end();
      this.rooms.delete(code);
    }
  }
}

function expected(p: PartyPlayback): number {
  return p.playing ? p.position + (Date.now() - p.updatedAt) / 1000 : p.position;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
