import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { PrismaClient } from "@animeshadow/db";
import {
  emojiOnly,
  PARTY_MAX,
  PARTY_STICKERS,
  type PartyChatMessage,
  type PartyEvent,
  type PartyMember,
  type PartyPlayback,
  type PartyListing,
  type PartySnapshot,
  type PartyVisibility,
} from "@animeshadow/shared";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { proActive } from "../lib/pro.js";
import type { DeliveryService } from "./delivery.service.js";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  pro: boolean;
}

interface Room {
  code: string;
  visibility: PartyVisibility;
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
  /** Each person's line speed, Mbit/s, as their player measures it. */
  net: Map<string, number | null>;
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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly delivery: DeliveryService,
    private readonly appUrl: string,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  async create(userId: string, animeId: number, episode: number, visibility: PartyVisibility = "public"): Promise<{ code: string }> {
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
      visibility,
      anime,
      hostId: userId,
      playback: { episode, playing: false, position: 0, updatedAt: now, by: userId, waitingFor: null },
      chat: [this.line(`${person.name} создал(а) комнату. Пригласите друзей по ссылке — до ${PARTY_MAX} человек.`)],
      people: new Map([[userId, person]]),
      streams: new Map(),
      createdAt: now,
      emptySince: now,
      lastReaction: new Map(),
      net: new Map(),
    });
    return { code };
  }

  snapshot(code: string): PartySnapshot {
    const room = this.room(code);
    return {
      code: room.code,
      visibility: room.visibility,
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
    // Fresh each time: PRO may have started (or ended) since the last visit.
    room.people.set(userId, await this.person(userId));
    const streamId = randomBytes(6).toString("hex");
    const wasOnline = online.has(userId);
    room.streams.set(streamId, { personId: userId, res });
    room.emptySince = null;
    this.write(res, { type: "hello", party: this.snapshot(code) });
    if (!wasOnline) {
      const me = room.people.get(userId)!;
      this.say(room, `${me.name} присоединился(ась)`);
      this.broadcastMembers(room);
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
        room.net.delete(userId);
        this.broadcastMembers(room);
      }
      if (room.streams.size === 0) room.emptySince = Date.now();
    };
  }

  async playback(
    code: string,
    userId: string,
    input: { animeId?: number | undefined; episode: number; playing: boolean; position: number; waiting?: boolean | undefined },
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
      room.playback = { episode: input.episode, playing: input.playing, position: input.position, updatedAt: Date.now(), by: userId, waitingFor: null };
      this.broadcast(room, { type: "anime", anime });
      this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
      this.say(room, `${room.people.get(userId)?.name ?? "Кто-то"} включил(а) «${anime.titleLocalized || anime.title}»`);
      return room.playback;
    }
    const before = room.playback;
    const who = room.people.get(userId)?.name ?? "Кто-то";
    room.playback = {
      episode: input.episode,
      playing: input.playing,
      position: input.position,
      updatedAt: Date.now(),
      by: userId,
      waitingFor: input.waiting ? who : null,
    };
    this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
    // Waiting for the slowest: said once, and the resume said too.
    if (input.waiting) {
      this.say(room, `Ждём ${who} — серия подгружается`);
      return room.playback;
    }
    if (before.waitingFor && input.playing) {
      this.say(room, `${who} догрузил(а) — продолжаем`);
      return room.playback;
    }
    if (before.episode !== input.episode) this.say(room, `${who} включил(а) ${input.episode} серию`);
    else if (before.playing && !input.playing) this.say(room, `${who} поставил(а) паузу на ${clock(input.position)}`);
    else if (!before.playing && input.playing && Math.abs(expected(before) - input.position) < 3) this.say(room, `${who} продолжил(а) просмотр`);
    else if (Math.abs(expected(before) - input.position) >= 3) this.say(room, `${who} перемотал(а) на ${clock(input.position)}`);
    return room.playback;
  }

  /**
   * A message. Emoji are everyone's; words, stickers and GIFs are PRO's — a
   * room of strangers stays a room of reactions unless someone supports the site.
   */
  chat(code: string, userId: string, input: { text?: string | undefined; sticker?: string | undefined; gif?: string | undefined }): PartyChatMessage {
    const room = this.member(code, userId);
    const me = room.people.get(userId)!;
    let kind: PartyChatMessage["kind"];
    let text = "";
    let media: string | null = null;
    if (input.sticker) {
      if (!PARTY_STICKERS.some((s) => s.code === input.sticker)) throw new BadRequestError("Нет такого стикера.");
      kind = "sticker";
      media = input.sticker;
    } else if (input.gif) {
      kind = "gif";
      media = input.gif;
    } else {
      text = (input.text ?? "").trim();
      if (!text) throw new BadRequestError("Пустое сообщение.");
      kind = emojiOnly(text) ? "emoji" : "text";
    }
    if (kind !== "emoji" && !me.pro) {
      throw new ForbiddenError(kind === "text" ? "Писать в комнатах можно с PRO. Смайлики — всем." : "Стикеры и гифки — с PRO.");
    }
    const message: PartyChatMessage = { id: randomBytes(6).toString("hex"), at: Date.now(), author: me, kind, text, media };
    this.push(room, message);
    this.broadcast(room, { type: "chat", message });
    return message;
  }

  /** The host decides who sees the room in the list. */
  settings(code: string, userId: string, visibility: PartyVisibility): { visibility: PartyVisibility } {
    const room = this.member(code, userId);
    if (room.hostId !== userId) throw new ForbiddenError("Это может только создатель комнаты.");
    room.visibility = visibility;
    this.broadcast(room, { type: "settings", visibility });
    const label = visibility === "public" ? "открытой — она видна всем в списке" : visibility === "friends" ? "только для друзей" : "только по ссылке";
    this.say(room, `Комната стала ${label}`);
    return { visibility };
  }

  /**
   * The rooms going on, as the viewer may see them: open ones, and the
   * friends-only rooms of their friends (and any room they're in). Busiest
   * first; empty rooms aren't listed.
   */
  async list(viewerId: string | undefined): Promise<PartyListing[]> {
    const rooms = [...this.rooms.values()].filter((r) => r.streams.size > 0);
    if (rooms.length === 0) return [];
    let friends = new Set<string>();
    if (viewerId) {
      const rows = await this.prisma.follow.findMany({
        where: { followingId: viewerId, follower: { followers: { some: { followerId: viewerId } } } },
        select: { followerId: true },
      });
      friends = new Set(rows.map((r) => r.followerId));
    }
    const now = Date.now();
    const out: PartyListing[] = [];
    for (const room of rooms) {
      const online = this.online(room);
      const mine = viewerId != null && online.some((m) => m.id === viewerId);
      const hostFriend = friends.has(room.hostId);
      const friendInside = online.some((m) => friends.has(m.id));
      const visible = mine || room.visibility === "public" || (room.visibility === "friends" && hostFriend);
      if (!visible) continue;
      const host = room.people.get(room.hostId);
      const p = room.playback;
      out.push({
        code: room.code,
        anime: room.anime,
        episode: p.episode,
        playing: p.playing,
        position: p.playing ? p.position + (now - p.updatedAt) / 1000 : p.position,
        visibility: room.visibility,
        host: { id: room.hostId, name: host?.name ?? "—", avatarUrl: host?.avatarUrl ?? null },
        members: online.length,
        faces: online.slice(0, 5).map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl })),
        full: online.length >= PARTY_MAX,
        friends: hostFriend || friendInside,
        mine,
        createdAt: room.createdAt,
      });
    }
    return out.sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.friends) - Number(a.friends) || b.members - a.members || b.createdAt - a.createdAt);
  }

  /** A member's line speed: the whole room's quality is capped to what the slowest can carry. */
  net(code: string, userId: string, mbps: number | null): void {
    const room = this.member(code, userId);
    const before = room.net.get(userId);
    room.net.set(userId, mbps);
    // Only a change worth telling everyone about.
    if (before == null || mbps == null || Math.abs((before ?? 0) - mbps) / Math.max(0.1, before ?? 1) > 0.25) this.broadcastMembers(room);
  }

  /**
   * Friends called into the room: a Telegram message and a push to each (who
   * has them on), and a line in the chat. Only mutual follows, nine at most.
   */
  async invite(code: string, userId: string, userIds: string[]): Promise<{ sent: number; reached: number }> {
    const room = this.member(code, userId);
    const me = room.people.get(userId)!;
    const ids = [...new Set(userIds)].filter((id) => id !== userId).slice(0, PARTY_MAX - 1);
    const mutual = await this.prisma.follow.findMany({
      where: { followerId: { in: ids }, followingId: userId, follower: { followers: { some: { followerId: userId } } } },
      select: { followerId: true },
    });
    const title = room.anime.titleLocalized || room.anime.title;
    let reached = 0;
    for (const { followerId } of mutual) {
      const ok = await this.delivery.direct(followerId, {
        title: `${me.name} зовёт смотреть вместе`,
        body: `«${title}», ${room.playback.episode} серия — заходите в комнату`,
        url: `${this.appUrl}/party/${room.code}`,
        button: "▶ Войти в комнату",
      });
      if (ok) reached += 1;
    }
    if (mutual.length) this.say(room, `${me.name} позвал(а) друзей: ${mutual.length}`);
    return { sent: mutual.length, reached };
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
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, avatarUrl: true, proSince: true, proUntil: true, trialUntil: true },
    });
    if (!u) throw new NotFoundError("Пользователь не найден.");
    return { id: u.id, name: u.displayName, avatarUrl: u.avatarUrl, pro: proActive(u) };
  }

  private online(room: Room): PartyMember[] {
    const ids = [...new Set([...room.streams.values()].map((s) => s.personId))];
    return ids
      .map((id) => room.people.get(id))
      .filter((p): p is Person => p != null)
      .map((p) => ({ ...p, host: p.id === room.hostId, mbps: room.net.get(p.id) ?? null }));
  }

  /** The highest quality every member's line carries (480/720/1080), or null while nobody has measured. */
  private capHeight(room: Room): number | null {
    const speeds = this.online(room)
      .map((m) => m.mbps)
      .filter((v): v is number => v != null && v > 0);
    if (speeds.length === 0) return null;
    const slowest = Math.min(...speeds);
    return slowest >= 4.8 ? 1080 : slowest >= 2.4 ? 720 : 480;
  }

  private broadcastMembers(room: Room) {
    this.broadcast(room, { type: "members", members: this.online(room), now: Date.now(), capHeight: this.capHeight(room) });
  }

  private line(text: string): PartyChatMessage {
    return { id: randomBytes(6).toString("hex"), at: Date.now(), author: null, kind: "system", text, media: null };
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
