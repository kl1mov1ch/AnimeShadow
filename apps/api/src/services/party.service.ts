import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import type { PrismaClient } from "@animeshadow/db";
import {
  type AdminPartyAction,
  type AdminPartyRoom,
  emojiOnly,
  PARTY_DEFAULT_SETTINGS,
  PARTY_MAX,
  PARTY_STICKERS,
  type PartyChatMessage,
  type PartyEvent,
  type PartyListing,
  type PartyMember,
  type PartyPlayback,
  type PartyQueueItem,
  type PartySettings,
  type PartySnapshot,
} from "@animeshadow/shared";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { proActive } from "../lib/pro.js";
import type { DeliveryService } from "./delivery.service.js";
import type { PartyStore } from "./party-store.js";
import { decodeRoom, encodeRoom } from "./party-codec.js";

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  pro: boolean;
}

/** What one person watched in a room: for the admin's statistics, nothing else. */
interface Watched {
  name: string;
  seconds: number;
  /** "animeId:episode" of everything they were in the room for while it played. */
  episodes: Set<string>;
}

export interface Room {
  code: string;
  settings: PartySettings;
  anime: PartySnapshot["anime"];
  hostId: string;
  creatorId: string;
  connectedOnce: boolean;
  official: boolean;
  name: string | null;
  durationSeconds: number | null;
  nextVotes: Set<string>;
  availableEpisodes: number[];
  playback: PartyPlayback;
  chat: PartyChatMessage[];
  /** Who has been in, by id — the ten places. */
  people: Map<string, Person>;
  /** Open event streams: one per tab. */
  streams: Map<string, { personId: string; res: ServerResponse }>;
  createdAt: number;
  emptySince: number | null;
  /** The host's last tab closed: when, so a reload doesn't end the room. */
  hostGoneAt: number | null;
  lastReaction: Map<string, number>;
  /** Each person's line speed, Mbit/s. */
  net: Map<string, number | null>;
  muted: Set<string>;
  /** Whose players are short of data right now. */
  loading: Set<string>;
  /** The room was paused by itself, for someone loading — it resumes by itself. */
  autoPaused: boolean;
  /** "What to watch next", by anime id. */
  queue: Map<number, { anime: PartyQueueItem["anime"]; by: string; votes: Set<string>; at: number }>;
  /** Watch time per person, counted as the room plays. */
  watched: Map<string, Watched>;
  /** Titles shown in this room, for the log. */
  titles: Map<number, string>;
  /** When watch time was last added up. */
  countedAt: number;
  /** Put out by the site's moderators: can't come back to this room. */
  banned: Set<string>;
  messages: number;
  reactions: number;
  /** Most people in at once. */
  peak: number;
  /** A members update is on its way (several changes in a moment go as one). */
  membersSoon: ReturnType<typeof setTimeout> | null;
}

/** One session, as written to the log when the room closes. */
export interface PartySessionLog {
  code: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  reason: string;
  titles: Array<{ id: number; title: string }>;
  people: Array<{ id: string; name: string; minutes: number; episodes: number }>;
  messages?: number;
  reactions?: number;
  peak?: number;
}

const CHAT_KEEP = 120;
/** An empty room is closed after this. */
const EMPTY_TTL = 5 * 60_000;
const UNVISITED_TTL = 60 * 60_000;
/** Give a reloading host time to reconnect before handing control over. */
const HOST_GRACE = 20_000;
/** A tab this far behind on its stream gets no reactions or pings until it catches up… */
const SLOW_STREAM = 256 * 1024;
/** …and this far behind it is dropped (it reconnects and gets a fresh snapshot). */
const DEAD_STREAM = 2 * 1024 * 1024;

/**
 * Watching together. A room is an anime, an episode and where playback is;
 * up to ten signed-in people, a chat and reactions. Only PRO opens a room;
 * its creator runs it — who may control playback, stickers, GIFs and
 * reactions on or off, who is muted. An absent host hands control to an
 * online member; only empty or never-visited rooms expire.
 *
 * Everything lives in memory (one API process) and is gone when the room
 * closes; what stays is one line in the log — how long each person watched,
 * how many episodes, of what — for the admin's statistics.
 */
export class PartyService {
  private rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval>;
  /** The most people in rooms at once since the server started. */
  private peakLive = { people: 0, at: 0 };
  private checkpointAt = 0;
  private mainTask: Promise<PartySnapshot | null> | null = null;
  private advancing = new Set<string>();
  private closing = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly delivery: DeliveryService,
    private readonly appUrl: string,
    private readonly logDir: string,
    private readonly store?: PartyStore,
    private readonly program?: (animeId?: number, episode?: number) => Promise<{ anime: Room["anime"]; episode: number; durationSeconds: number; sourceId?: string; availableEpisodes?: number[] } | null>,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 5_000);
    this.sweeper.unref();
  }

  async create(userId: string, animeId: number, episode: number, visibility: PartySettings["visibility"] = "public", name: string | null = null): Promise<{ code: string }> {
    const person = await this.person(userId);
    if (!person.pro) throw new ForbiddenError("Создавать комнаты можно с PRO. Заходить в чужие — всем.");
    const anime = await this.prisma.anime.findUnique({
      where: { id: animeId },
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true },
    });
    if (!anime) throw new NotFoundError("Аниме не найдено.");
    // Opening another room must not interrupt people still watching in an earlier one.
    let code = "";
    do code = randomBytes(5).toString("base64url").slice(0, 7);
    while (this.rooms.has(code));
    const now = Date.now();
    this.rooms.set(code, {
      code,
      settings: { ...PARTY_DEFAULT_SETTINGS, visibility },
      anime,
      hostId: userId,
      creatorId: userId,
      connectedOnce: false,
      official: false,
      name,
      durationSeconds: null,
      nextVotes: new Set(),
      availableEpisodes: [],
      playback: { episode, playing: false, position: 0, updatedAt: now, by: userId, waitingFor: null },
      chat: [this.line(`${person.name} создал(а) комнату. Позовите друзей — до ${PARTY_MAX} человек.`)],
      people: new Map([[userId, person]]),
      streams: new Map(),
      createdAt: now,
      emptySince: now,
      hostGoneAt: null,
      lastReaction: new Map(),
      net: new Map(),
      muted: new Set(),
      loading: new Set(),
      autoPaused: false,
      queue: new Map(),
      watched: new Map(),
      titles: new Map([[anime.id, anime.titleLocalized || anime.title]]),
      countedAt: now,
      banned: new Set(),
      messages: 0,
      reactions: 0,
      peak: 0,
      membersSoon: null,
    });
    this.checkpoint(this.rooms.get(code)!);
    return { code };
  }

  snapshot(code: string): PartySnapshot {
    const room = this.room(code);
    return {
      code: room.code,
      settings: room.settings,
      anime: room.anime,
      hostId: room.hostId,
      official: room.official,
      name: room.name,
      durationSeconds: room.durationSeconds,
      nextVotes: [...room.nextVotes],
      capacity: room.official ? 200 : PARTY_MAX,
      availableEpisodes: room.availableEpisodes,
      members: this.online(room),
      playback: room.playback,
      chat: room.chat.slice(-60),
      queue: this.queueOf(room),
      now: Date.now(),
    };
  }

  /** A tab joins the room's stream; the first stream of a new person takes one of the ten places. */
  async connect(code: string, userId: string, res: ServerResponse): Promise<() => void> {
    const room = this.room(code);
    if (room.banned.has(userId)) throw new ForbiddenError("Администрация убрала вас из этой комнаты.");
    const online = new Set([...room.streams.values()].map((s) => s.personId));
    const capacity = room.official ? 200 : PARTY_MAX;
    if (!online.has(userId) && online.size >= capacity) {
      throw new ForbiddenError(`В комнате уже ${capacity} человек.`);
    }
    // Fresh each time: PRO may have started (or ended) since the last visit.
    const person = await this.person(userId);
    // Capacity/room lifetime can change while the account query is in flight.
    if (this.rooms.get(code) !== room) throw new NotFoundError("Комната уже закрыта.");
    const currentOnline = new Set([...room.streams.values()].map((s) => s.personId));
    if (!currentOnline.has(userId) && currentOnline.size >= capacity) throw new ForbiddenError(`В комнате уже ${capacity} человек.`);
    room.people.set(userId, person);
    this.count(room);
    const streamId = randomBytes(6).toString("hex");
    const wasOnline = online.has(userId);
    room.streams.set(streamId, { personId: userId, res });
    room.connectedOnce = true;
    room.emptySince = null;
    if (userId === room.hostId) room.hostGoneAt = null;
    this.checkpoint(room);
    this.write(res, { type: "hello", party: this.snapshot(code) });
    if (!wasOnline) {
      this.say(room, `${room.people.get(userId)!.name} присоединился(ась)`, true);
      this.broadcastMembers(room);
      room.peak = Math.max(room.peak, online.size + 1);
      const live = [...this.rooms.values()].reduce((n, r) => n + new Set([...r.streams.values()].map((s) => s.personId)).size, 0);
      if (live > this.peakLive.people) this.peakLive = { people: live, at: Date.now() };
    }
    const ping = setInterval(() => this.write(res, { type: "ping", now: Date.now() }), 20_000);
    return () => {
      clearInterval(ping);
      if (!this.rooms.has(room.code)) return;
      this.count(room);
      if (!room.streams.delete(streamId)) return;
      const still = [...room.streams.values()].some((s) => s.personId === userId);
      if (!still) {
        const me = room.people.get(userId);
        // A reload gets a short grace period before control is handed over.
        if (room.hostId === userId) room.hostGoneAt = Date.now();
        else if (me && !room.banned.has(userId)) this.say(room, `${me.name} вышел(ла)`, true);
        room.net.delete(userId);
        if (room.loading.delete(userId)) this.afterLoading(room);
        this.broadcastMembers(room);
      }
      if (room.streams.size === 0) this.becameEmpty(room);
      this.checkpoint(room);
    };
  }

  /** Leaving removes only this person's tabs. Others keep watching. */
  leave(code: string, userId: string): { closed: boolean } {
    const room = this.rooms.get(code);
    if (!room) return { closed: true };
    this.count(room);
    for (const [id, stream] of room.streams) {
      if (stream.personId !== userId) continue;
      room.streams.delete(id);
      stream.res.end();
    }
    room.net.delete(userId);
    if (room.loading.delete(userId)) this.afterLoading(room);
    if (room.hostId === userId) { room.hostGoneAt = Date.now(); this.handoff(room); }
    if (room.streams.size === 0) this.becameEmpty(room);
    this.broadcastMembers(room);
    this.checkpoint(room);
    return { closed: false };
  }

  private becameEmpty(room: Room) {
    if (room.official) return;
    if (room.emptySince != null) return;
    room.emptySince = Date.now();
    room.playback = { ...room.playback, position: expected(room.playback), playing: false, updatedAt: Date.now(), waitingFor: null };
    room.autoPaused = false;
    this.notifyCreator(room, "Комната ждёт вас", "Все вышли. Вернитесь в течение 5 минут, чтобы продолжить.", false);
  }

  private handoff(room: Room) {
    if (room.official) return;
    const next = this.online(room).find((person) => person.id !== room.hostId);
    if (!next) return;
    room.hostId = next.id;
    room.hostGoneAt = null;
    room.muted.delete(next.id);
    this.broadcast(room, { type: "host", hostId: next.id, name: next.name });
    this.say(room, `Теперь комнатой управляет ${next.name}`);
    this.broadcastMembers(room);
  }

  private notifyCreator(room: Room, title: string, body: string, closed: boolean) {
    if (room.official) return;
    void this.delivery.room(room.creatorId, {
      title, body: `${room.anime.titleLocalized || room.anime.title} · ${body}`,
      url: closed ? `${this.appUrl}/anime/${room.anime.slug || room.anime.id}` : `${this.appUrl}/party/${room.code}`,
      tag: `party-${room.code}-${closed ? "closed" : "waiting"}`,
    }).catch(() => undefined);
  }

  async playback(
    code: string,
    userId: string,
    input: { animeId?: number | undefined; episode: number; playing: boolean; position: number; waiting?: boolean | undefined; sourceId?: string | null | undefined },
  ): Promise<PartyPlayback> {
    const room = this.member(code, userId);
    if (room.official) throw new ForbiddenError("Программу общего эфира выбирают голосованием.");
    const host = userId === room.hostId;
    if (!host && !room.settings.allControl) throw new ForbiddenError("Управляет ведущий комнаты.");
    room.autoPaused = false;
    if (input.animeId != null && !host && !room.settings.allControl) throw new ForbiddenError("Аниме меняет ведущий комнаты.");
    this.count(room);

    // Another title for the whole room: everyone's page follows.
    if (input.animeId != null && input.animeId !== room.anime.id) {
      const anime = await this.prisma.anime.findUnique({
        where: { id: input.animeId },
        select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true },
      });
      if (!anime) throw new NotFoundError("Аниме не найдено.");
      room.anime = anime;
      room.titles.set(anime.id, anime.titleLocalized || anime.title);
      room.loading.clear();
      room.queue.delete(anime.id);
      this.broadcast(room, { type: "queue", queue: this.queueOf(room) });
      room.playback = { episode: input.episode, playing: input.playing, position: input.position, updatedAt: Date.now(), by: userId, waitingFor: null, sourceId: input.sourceId ?? null };
      this.broadcast(room, { type: "anime", anime });
      this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
      this.say(room, `${room.people.get(userId)?.name ?? "Кто-то"} включил(а) «${anime.titleLocalized || anime.title}»`);
      return room.playback;
    }
    const before = room.playback;
    const who = room.people.get(userId)?.name ?? "Кто-то";
    // A new episode: nobody is loading the old one any more.
    if (before.episode !== input.episode) room.loading.clear();
    room.playback = {
      sourceId: input.sourceId ?? room.playback.sourceId ?? null,
      episode: input.episode,
      playing: input.playing,
      position: input.position,
      updatedAt: Date.now(),
      by: userId,
      waitingFor: null,
    };
    this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
    if (before.episode !== input.episode) this.say(room, `${who} включил(а) ${input.episode} серию`);
    else if (before.playing && !input.playing) this.say(room, `${who} поставил(а) паузу на ${clock(input.position)}`, true);
    else if (!before.playing && input.playing && Math.abs(expected(before) - input.position) < 3) this.say(room, `${who} продолжил(а) просмотр`, true);
    else if (Math.abs(expected(before) - input.position) >= 3) this.say(room, `${who} перемотал(а) на ${clock(input.position)}`, true);
    this.checkpoint(room);
    return room.playback;
  }

  /**
   * A message. Emoji are everyone's; words, stickers and GIFs are PRO's, and
   * the host may switch stickers and GIFs off or mute someone.
   */
  chat(code: string, userId: string, input: { text?: string | undefined; sticker?: string | undefined; gif?: string | undefined }): PartyChatMessage {
    const room = this.member(code, userId);
    const me = room.people.get(userId)!;
    if (room.muted.has(userId)) throw new ForbiddenError("Ведущий комнаты отключил вам чат.");
    let kind: PartyChatMessage["kind"];
    let text = "";
    let media: string | null = null;
    if (input.sticker) {
      if (!room.settings.stickers) throw new ForbiddenError("Стикеры в этой комнате выключены.");
      if (!PARTY_STICKERS.some((s) => s.code === input.sticker)) throw new BadRequestError("Нет такого стикера.");
      kind = "sticker";
      media = input.sticker;
    } else if (input.gif) {
      if (!room.settings.gifs) throw new ForbiddenError("Гифки в этой комнате выключены.");
      kind = "gif";
      media = input.gif;
    } else {
      text = (input.text ?? "").trim();
      if (!text) throw new BadRequestError("Пустое сообщение.");
      kind = emojiOnly(text) ? "emoji" : "text";
    }
    if (kind !== "emoji" && !me.pro && !room.official) {
      throw new ForbiddenError(kind === "text" ? "Писать в комнатах можно с PRO. Смайлики — всем." : "Стикеры и гифки — с PRO.");
    }
    const message: PartyChatMessage = { id: randomBytes(6).toString("hex"), at: Date.now(), author: me, kind, text, media };
    room.messages += 1;
    this.push(room, message);
    this.broadcast(room, { type: "chat", message });
    return message;
  }

  /** The host's switches: who sees the room, stickers, GIFs, reactions, who controls playback. */
  settings(code: string, userId: string, patch: Partial<PartySettings>): PartySettings {
    const room = this.member(code, userId);
    if (room.hostId !== userId) throw new ForbiddenError("Это может только ведущий комнаты.");
    return this.applySettings(room, patch, "Создатель");
  }

  private applySettings(room: Room, patch: Partial<PartySettings>, who: string): PartySettings {
    const next = { ...room.settings, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null)) } as PartySettings;
    const said: string[] = [];
    if (next.visibility !== room.settings.visibility)
      said.push(next.visibility === "public" ? "комната открыта всем" : next.visibility === "friends" ? "комната только для друзей" : "комната только по ссылке");
    if (next.stickers !== room.settings.stickers) said.push(next.stickers ? "стикеры включены" : "стикеры выключены");
    if (next.gifs !== room.settings.gifs) said.push(next.gifs ? "гифки включены" : "гифки выключены");
    if (next.reactions !== room.settings.reactions) said.push(next.reactions ? "реакции включены" : "реакции выключены");
    if (next.allControl !== room.settings.allControl) said.push(next.allControl ? "управлять могут все" : "управляет только создатель");
    if (next.waitForSlow !== room.settings.waitForSlow) said.push(next.waitForSlow ? "ждём тех, у кого грузится" : "не ждём отстающих");
    if (next.capQuality !== room.settings.capQuality) said.push(next.capQuality ? "качество по самому медленному" : "каждый смотрит в своём качестве");
    if (next.systemMessages !== room.settings.systemMessages) said.push(next.systemMessages ? "служебные сообщения включены" : "служебные сообщения выключены");
    if (next.autoNext !== room.settings.autoNext) said.push(next.autoNext ? "следующая серия включается сама" : "без автоперехода");
    const stopWaiting = room.settings.waitForSlow && !next.waitForSlow;
    room.settings = next;
    this.broadcast(room, { type: "settings", settings: next });
    if (stopWaiting && room.autoPaused) {
      room.loading.clear();
      this.afterLoading(room);
    }
    if (patch.capQuality != null) this.broadcastMembers(room);
    if (said.length) this.say(room, `${who}: ${said.join(", ")}`);
    return next;
  }

  /**
   * A member's player is short of data (or ready again). With "wait for the
   * slow" on, the room pauses at once for them — everyone sees who — and
   * goes on by itself when nobody is loading any more.
   */
  loadingState(code: string, userId: string, loading: boolean): void {
    const room = this.member(code, userId);
    const had = room.loading.has(userId);
    if (loading === had) return;
    if (loading) room.loading.add(userId);
    else room.loading.delete(userId);
    if (loading && room.settings.waitForSlow && room.playback.playing) {
      this.count(room);
      room.autoPaused = true;
      room.playback = { ...room.playback, playing: false, position: expected(room.playback), updatedAt: Date.now(), by: null, waitingFor: this.waitingNames(room) };
      this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
      this.say(room, `Пауза — ждём ${this.waitingNames(room)}: серия подгружается`, true);
    } else if (room.autoPaused) {
      this.afterLoading(room);
    }
    this.broadcastMembers(room);
  }

  /** Someone stopped loading: if nobody else is, an automatic pause ends. */
  private afterLoading(room: Room) {
    if (!room.autoPaused) return;
    if (room.loading.size > 0) {
      room.playback = { ...room.playback, waitingFor: this.waitingNames(room), updatedAt: Date.now() };
      this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
      return;
    }
    room.autoPaused = false;
    this.count(room);
    room.playback = { ...room.playback, playing: true, updatedAt: Date.now(), by: null, waitingFor: null };
    this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
    this.say(room, "Все догрузили — продолжаем", true);
  }

  private waitingNames(room: Room): string {
    const names = [...room.loading].map((id) => room.people.get(id)?.name ?? "кого-то");
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} и ещё ${names.length - 2}` : names.join(" и ");
  }

  /** "What to watch next": anyone proposes an anime (it counts as their vote). */
  async propose(code: string, userId: string, animeId: number) {
    const room = this.member(code, userId);
    if (animeId === room.anime.id) throw new BadRequestError("Это аниме уже идёт.");
    if (room.official) {
      if (!await this.program?.(animeId, 1)) throw new BadRequestError("Для этого аниме сейчас нет доступного потока.");
      this.clearBallot(room, userId);
      this.broadcast(room, { type: "ballot", nextVotes: [...room.nextVotes] });
    }
    const have = room.queue.get(animeId);
    if (have) {
      have.votes.add(userId);
    } else {
      if (room.queue.size >= 12) throw new BadRequestError("В очереди уже 12 аниме.");
      const anime = await this.prisma.anime.findUnique({
        where: { id: animeId },
        select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true },
      });
      if (!anime) throw new NotFoundError("Аниме не найдено.");
      room.queue.set(animeId, { anime, by: userId, votes: new Set([userId]), at: Date.now() });
      this.say(room, `${room.people.get(userId)?.name ?? "Кто-то"} предлагает «${anime.titleLocalized || anime.title}»`);
    }
    this.broadcast(room, { type: "queue", queue: this.queueOf(room) });
    this.checkpoint(room);
    return { queue: this.queueOf(room) };
  }

  vote(code: string, userId: string, animeId: number) {
    const room = this.member(code, userId);
    const item = room.queue.get(animeId);
    if (!item) throw new NotFoundError("Этого аниме нет в очереди.");
    const selected = item.votes.has(userId);
    if (room.official) this.clearBallot(room, userId);
    if (selected) item.votes.delete(userId);
    else item.votes.add(userId);
    if (room.official) this.broadcast(room, { type: "ballot", nextVotes: [...room.nextVotes] });
    this.broadcast(room, { type: "queue", queue: this.queueOf(room) });
    this.checkpoint(room);
    return { queue: this.queueOf(room) };
  }

  unpropose(code: string, userId: string, animeId: number) {
    const room = this.member(code, userId);
    const item = room.queue.get(animeId);
    if (!item) return { queue: this.queueOf(room) };
    if (item.by !== userId && room.hostId !== userId) throw new ForbiddenError("Убрать может тот, кто предложил, или создатель.");
    room.queue.delete(animeId);
    this.broadcast(room, { type: "queue", queue: this.queueOf(room) });
    this.checkpoint(room);
    return { queue: this.queueOf(room) };
  }

  private queueOf(room: Room): PartyQueueItem[] {
    return [...room.queue.values()]
      .sort((a, b) => b.votes.size - a.votes.size || a.at - b.at)
      .map((q) => ({ anime: q.anime, by: room.people.get(q.by)?.name ?? "—", votes: [...q.votes] }));
  }

  /** The host mutes (or unmutes) someone in the chat. */
  mute(code: string, userId: string, target: string, muted: boolean): { muted: boolean } {
    const room = this.member(code, userId);
    if (room.hostId !== userId) throw new ForbiddenError("Это может только ведущий комнаты.");
    if (target === room.hostId) throw new BadRequestError("Себя заглушить нельзя.");
    if (muted) room.muted.add(target);
    else room.muted.delete(target);
    const name = room.people.get(target)?.name ?? "Участник";
    this.say(room, muted ? `${name} больше не может писать в чат` : `${name} снова может писать`);
    this.broadcastMembers(room);
    return { muted };
  }

  /**
   * The rooms going on, as the viewer may see them: open ones, and the
   * friends-only rooms of their friends (and any room they're in). Busiest
   * first; empty rooms aren't listed.
   */
  async list(viewerId: string | undefined): Promise<PartyListing[]> {
    const rooms = [...this.rooms.values()].filter((r) => !r.official && (r.streams.size > 0 || r.creatorId === viewerId));
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
      const mine = viewerId != null && (room.creatorId === viewerId || online.some((m) => m.id === viewerId));
      const hostFriend = friends.has(room.hostId);
      const friendInside = online.some((m) => friends.has(m.id));
      const v = room.settings.visibility;
      const visible = mine || v === "public" || (v === "friends" && hostFriend);
      if (!visible) continue;
      const host = room.people.get(room.hostId);
      const p = room.playback;
      out.push({
        name: room.name,
        code: room.code,
        anime: room.anime,
        episode: p.episode,
        playing: p.playing,
        position: p.playing ? p.position + (now - p.updatedAt) / 1000 : p.position,
        visibility: v,
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
        title: `${me.name} приглашает в комнату`,
        body: `${title} · Серия ${room.playback.episode}`,
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
    if (!room.settings.reactions) throw new ForbiddenError("Реакции в этой комнате выключены.");
    const last = room.lastReaction.get(userId) ?? 0;
    if (Date.now() - last < 400) return;
    room.lastReaction.set(userId, Date.now());
    room.reactions += 1;
    this.broadcast(room, { type: "reaction", emoji, by: userId, name: room.people.get(userId)!.name });
  }

  // ---- the site's admin: every room, and the levers -------------------------

  /** Every room open now — empty ones too — busiest first. */
  adminRooms(): AdminPartyRoom[] {
    const now = Date.now();
    return [...this.rooms.values()]
      .map((room) => {
        const members = this.online(room);
        const host = room.people.get(room.hostId);
        const p = room.playback;
        return {
          code: room.code,
          anime: room.anime,
          episode: p.episode,
          playing: p.playing,
          position: p.playing ? p.position + (now - p.updatedAt) / 1000 : p.position,
          settings: room.settings,
          host: { id: room.hostId, name: host?.name ?? "—", avatarUrl: host?.avatarUrl ?? null, online: members.some((m) => m.id === room.hostId) },
          members,
          streams: room.streams.size,
          createdAt: room.createdAt,
          emptySince: room.emptySince,
          messages: room.messages,
          reactions: room.reactions,
          queue: room.queue.size,
          peak: room.peak,
          banned: room.banned.size,
          waitingFor: p.waitingFor,
          chat: room.chat.slice(-25),
        };
      })
      .sort((a, b) => b.members.length - a.members.length || b.createdAt - a.createdAt);
  }

  /** What the admin does to a room: close it, put someone out, say something, take a message down, pause it. */
  adminAction(code: string, action: AdminPartyAction): { ok: true } {
    const room = this.room(code);
    switch (action.action) {
      case "close":
        this.close(room, action.reason ? `Комнату закрыла администрация: ${action.reason}` : "Комнату закрыла администрация");
        break;
      case "kick": {
        if (action.userId === room.hostId) {
          this.close(room, "Комнату закрыла администрация");
          break;
        }
        room.banned.add(action.userId);
        const name = room.people.get(action.userId)?.name ?? "Участник";
        for (const [id, s] of room.streams) {
          if (s.personId !== action.userId) continue;
          this.write(s.res, { type: "closed", reason: "Администрация убрала вас из этой комнаты" });
          s.res.end();
          room.streams.delete(id);
        }
        room.net.delete(action.userId);
        if (room.loading.delete(action.userId)) this.afterLoading(room);
        if (room.streams.size === 0) room.emptySince = Date.now();
        this.say(room, `${name} удалён(а) из комнаты администрацией`);
        this.broadcastMembers(room);
        break;
      }
      case "say":
        this.say(room, `Администрация: ${action.text}`);
        break;
      case "unchat": {
        const at = room.chat.findIndex((m) => m.id === action.messageId);
        if (at < 0) throw new NotFoundError("Сообщение уже ушло из чата.");
        room.chat.splice(at, 1);
        this.broadcast(room, { type: "unchat", id: action.messageId });
        break;
      }
      case "pause": {
        if (!room.playback.playing) break;
        this.count(room);
        room.playback = { ...room.playback, playing: false, position: expected(room.playback), updatedAt: Date.now(), by: "admin" };
        this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
        this.say(room, "Администрация поставила паузу");
        break;
      }
    }
    return { ok: true };
  }

  /** A switch flipped by the admin, as if by the host. */
  adminSettings(code: string, patch: Partial<PartySettings>): PartySettings {
    const room = this.room(code);
    return this.applySettings(room, patch, "Администрация");
  }

  // ---- the admin's statistics ------------------------------------------------

  /** Sessions of the last `days`, summed: totals, the titles watched, people by watch time. */
  async stats(days = 30) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const names = (await readdir(this.logDir).catch(() => [] as string[])).filter((n) => /^party-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n) && n.slice(6, 16) >= cutoff);
    const sessions: PartySessionLog[] = [];
    for (const name of names) {
      const text = await readFile(join(this.logDir, name), "utf8").catch(() => "");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          sessions.push(JSON.parse(line) as PartySessionLog);
        } catch {
          // A broken line: skipped.
        }
      }
    }
    const people = new Map<string, { id: string; name: string; minutes: number; episodes: number; sessions: number }>();
    const titles = new Map<number, { id: number; title: string; sessions: number; viewers: number }>();
    const byDay = new Map<string, { day: string; sessions: number; minutes: number; viewers: Set<string> }>();
    const reasons = new Map<string, number>();
    const hours = Array.from({ length: 24 }, () => 0);
    let minutes = 0;
    let length = 0;
    let messages = 0;
    let reactions = 0;
    for (const s of sessions) {
      const watched = s.people.reduce((n, p) => n + p.minutes, 0);
      minutes += watched;
      length += s.minutes;
      messages += s.messages ?? 0;
      reactions += s.reactions ?? 0;
      const day = s.endedAt.slice(0, 10);
      const d = byDay.get(day) ?? { day, sessions: 0, minutes: 0, viewers: new Set<string>() };
      d.sessions += 1;
      d.minutes += watched;
      for (const p of s.people) d.viewers.add(p.id);
      byDay.set(day, d);
      // Moscow time: when rooms start.
      hours[(new Date(s.startedAt).getUTCHours() + 3) % 24]! += 1;
      const reason = s.reason.replace(/:.*$/, "");
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      for (const p of s.people) {
        const row = people.get(p.id) ?? { id: p.id, name: p.name, minutes: 0, episodes: 0, sessions: 0 };
        row.name = p.name;
        row.minutes += p.minutes;
        row.episodes += p.episodes;
        row.sessions += 1;
        people.set(p.id, row);
      }
      for (const t of s.titles) {
        const row = titles.get(t.id) ?? { id: t.id, title: t.title, sessions: 0, viewers: 0 };
        row.sessions += 1;
        row.viewers += s.people.length;
        titles.set(t.id, row);
      }
    }
    return {
      days,
      sessions: sessions.length,
      viewers: people.size,
      minutes,
      live: {
        rooms: [...this.rooms.values()].filter((r) => r.streams.size > 0).length,
        people: [...this.rooms.values()].reduce((n, r) => n + this.online(r).length, 0),
        open: this.rooms.size,
        peak: this.peakLive.people,
        peakAt: this.peakLive.at || null,
      },
      avgMinutes: sessions.length ? Math.round(length / sessions.length) : 0,
      avgPeople: sessions.length ? Math.round((sessions.reduce((n, s) => n + s.people.length, 0) / sessions.length) * 10) / 10 : 0,
      messages,
      reactions,
      byDay: Array.from({ length: days }, (_, i) => {
        const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
        const d = byDay.get(day);
        return { day, sessions: d?.sessions ?? 0, minutes: d?.minutes ?? 0, viewers: d?.viewers.size ?? 0 };
      }),
      hours,
      reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      titles: [...titles.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 15),
      people: [...people.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 25),
      recent: sessions.slice(-15).reverse(),
    };
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
      .map((p) => ({ ...p, host: p.id === room.hostId, mbps: room.net.get(p.id) ?? null, muted: room.muted.has(p.id), loading: room.loading.has(p.id) }));
  }

  /** Adds the time since the last count to everyone in the room, if it was playing. */
  private count(room: Room) {
    const now = Date.now();
    const elapsed = (now - room.countedAt) / 1000;
    room.countedAt = now;
    if (!room.playback.playing || elapsed <= 0) return;
    const key = `${room.anime.id}:${room.playback.episode}`;
    for (const m of this.online(room)) {
      const w = room.watched.get(m.id) ?? { name: m.name, seconds: 0, episodes: new Set<string>() };
      w.seconds += Math.min(elapsed, 3600);
      if (w.seconds > 0) w.episodes.add(key);
      room.watched.set(m.id, w);
    }
  }

  /** The highest quality every member's line carries (480/720/1080), or null while nobody has measured. */
  private capHeight(room: Room): number | null {
    if (!room.settings.capQuality) return null;
    const speeds = this.online(room)
      .map((m) => m.mbps)
      .filter((v): v is number => v != null && v > 0);
    if (speeds.length === 0) return null;
    const slowest = Math.min(...speeds);
    return slowest >= 4.8 ? 1080 : slowest >= 2.4 ? 720 : 480;
  }

  /** Who's in, to everyone — several changes within a moment (a join, a speed, a "loading") go as one. */
  private broadcastMembers(room: Room) {
    if (room.membersSoon) return;
    room.membersSoon = setTimeout(() => {
      room.membersSoon = null;
      if (this.rooms.has(room.code)) this.broadcast(room, { type: "members", members: this.online(room), now: Date.now(), capHeight: this.capHeight(room) });
    }, 40);
  }

  private line(text: string): PartyChatMessage {
    return { id: randomBytes(6).toString("hex"), at: Date.now(), author: null, kind: "system", text, media: null };
  }

  /** A line from the room; `chatter` ones (joins, pauses, seeks) only while the host keeps them on. */
  private say(room: Room, text: string, chatter = false) {
    if (chatter && !room.settings.systemMessages) return;
    const message = this.line(text);
    this.push(room, message);
    this.broadcast(room, { type: "chat", message });
  }

  private push(room: Room, message: PartyChatMessage) {
    room.chat.push(message);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    this.checkpoint(room);
  }

  /** One event to every tab — serialised once, not once per tab. */
  private broadcast(room: Room, event: PartyEvent) {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const { res } of room.streams.values()) this.send(res, frame, event.type);
  }

  private write(res: ServerResponse, event: PartyEvent) {
    this.send(res, `data: ${JSON.stringify(event)}\n\n`, event.type);
  }

  /**
   * A frame down one stream. A tab that has fallen behind (a phone on a bad
   * line, a sleeping laptop) is spared what doesn't matter — reactions,
   * pings — and dropped if it falls far behind; it reconnects and starts
   * from a fresh snapshot instead of the server holding megabytes for it.
   */
  private send(res: ServerResponse, frame: string, type: PartyEvent["type"]) {
    if (res.writableEnded || res.destroyed) return;
    const behind = res.writableLength;
    if (behind > DEAD_STREAM) {
      res.destroy();
      return;
    }
    if (behind > SLOW_STREAM && (type === "reaction" || type === "ping")) return;
    res.write(frame);
  }

  /** The room ends: everyone told, the streams closed, everything forgotten — but one line to the log. */
  private close(room: Room, reason: string) {
    if (!this.rooms.has(room.code)) return;
    this.count(room);
    if (room.membersSoon) clearTimeout(room.membersSoon);
    this.rooms.delete(room.code);
    void this.store?.remove(room.code).catch(() => undefined);
    this.broadcast(room, { type: "closed", reason });
    for (const { res } of room.streams.values()) res.end();
    this.notifyCreator(room, "Комната закрыта", reason, true);
    void this.log(room, reason);
  }

  private async log(room: Room, reason: string) {
    const people = [...room.watched.entries()]
      .filter(([, w]) => w.seconds >= 30)
      .map(([id, w]) => ({ id, name: w.name, minutes: Math.round(w.seconds / 60), episodes: w.episodes.size }));
    if (people.length === 0) return;
    const entry: PartySessionLog = {
      code: room.code,
      startedAt: new Date(room.createdAt).toISOString(),
      endedAt: new Date().toISOString(),
      minutes: Math.round((Date.now() - room.createdAt) / 60_000),
      reason,
      titles: [...room.titles.entries()].map(([id, title]) => ({ id, title })),
      people,
      messages: room.messages,
      reactions: room.reactions,
      peak: room.peak,
    };
    try {
      await mkdir(this.logDir, { recursive: true });
      await appendFile(join(this.logDir, `party-${entry.endedAt.slice(0, 10)}.jsonl`), `${JSON.stringify(entry)}\n`);
    } catch {
      // The log is best effort.
    }
  }

  /** Session logs older than `days`. */
  async prune(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    let removed = 0;
    for (const name of await readdir(this.logDir).catch(() => [] as string[])) {
      if (/^party-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(6, 16) < cutoff) {
        await unlink(join(this.logDir, name)).catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  }

  private sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (room.official) {
        if (room.durationSeconds && expected(room.playback) >= room.durationSeconds) void this.advanceMain(room);
        continue;
      }
      if (room.hostGoneAt != null && now - room.hostGoneAt >= HOST_GRACE) this.handoff(room);
      if (!room.connectedOnce && now - room.createdAt >= UNVISITED_TTL) this.close(room, "За час никто не подключился");
      else if (room.connectedOnce && room.emptySince != null && now - room.emptySince >= EMPTY_TTL) this.close(room, "Никто не вернулся за 5 минут");
      else if (room.playback.playing && now - room.countedAt > 60_000) this.count(room);
    }
    if (now - this.checkpointAt >= 15_000) {
      this.checkpointAt = now;
      for (const room of this.rooms.values()) this.checkpoint(room);
    }
  }

  async dispose() {
    if (this.closing) return;
    this.closing = true;
    clearInterval(this.sweeper);
    const rooms = [...this.rooms.values()];
    for (const room of rooms) this.checkpoint(room);
    this.rooms.clear();
    for (const room of rooms) {
      if (room.membersSoon) clearTimeout(room.membersSoon);
      for (const { res } of room.streams.values()) res.end();
    }
    await this.store?.flush();
  }

  private checkpoint(room: Room) { void this.store?.save(room.code, encodeRoom(room)).catch(() => undefined); }

  async restore() {
    if (!this.store) return;
    for (const value of await this.store.load()) {
      const room = decodeRoom(value);
      if (room) this.rooms.set(room.code, room);
    }
    this.sweep();
  }

  /** A real shared program, driven by server time rather than a viewer's tab. */
  async main(): Promise<PartySnapshot | null> {
    if (this.closing) return null;
    const current = this.rooms.get("main-live");
    if (current) {
      if (current.availableEpisodes.length === 0 && this.program) {
        const metadata = await this.program(current.anime.id, current.playback.episode);
        if (metadata) {
          current.availableEpisodes = metadata.availableEpisodes ?? [];
          current.playback.sourceId ??= metadata.sourceId ?? null;
          this.checkpoint(current);
        }
      }
      if (current.durationSeconds && expected(current.playback) >= current.durationSeconds) await this.advanceMain(current);
      return current.durationSeconds && expected(current.playback) >= current.durationSeconds ? null : this.snapshot(current.code);
    }
    if (!this.program) return null;
    if (this.mainTask) return this.mainTask;
    this.mainTask = (async () => {
      const pick = await this.program!();
      if (!pick || this.closing) return null;
      const now = Date.now();
      const room: Room = {
        code: "main-live", anime: pick.anime, name: "Общий эфир AnimeShadow", official: true,
        hostId: "animeshadow", creatorId: "animeshadow", connectedOnce: true, durationSeconds: pick.durationSeconds, nextVotes: new Set(),
        availableEpisodes: pick.availableEpisodes ?? [],
        settings: { ...PARTY_DEFAULT_SETTINGS, visibility: "public", waitForSlow: false, capQuality: false },
        playback: { episode: pick.episode, position: 0, playing: true, updatedAt: now, by: null, waitingFor: null, sourceId: pick.sourceId ?? null },
        people: new Map(), streams: new Map(), createdAt: now, emptySince: null, hostGoneAt: null,
        chat: [this.line("Общий эфир идёт по серверному времени. Выбирайте продолжение голосованием.")],
        lastReaction: new Map(), net: new Map(), muted: new Set(), loading: new Set(), autoPaused: false, queue: new Map(),
        watched: new Map(), titles: new Map([[pick.anime.id, pick.anime.titleLocalized || pick.anime.title]]),
        countedAt: now, banned: new Set(), messages: 0, reactions: 0, peak: 0, membersSoon: null,
      };
      this.rooms.set(room.code, room);
      this.checkpoint(room);
      return this.snapshot(room.code);
    })().finally(() => { this.mainTask = null; });
    return this.mainTask;
  }

  voteNext(code: string, userId: string) {
    const room = this.member(code, userId);
    if (!room.official) throw new BadRequestError("Это голосование доступно в общем эфире.");
    const selected = room.nextVotes.has(userId);
    this.clearBallot(room, userId);
    if (!selected) room.nextVotes.add(userId);
    this.broadcast(room, { type: "ballot", nextVotes: [...room.nextVotes] });
    this.broadcast(room, { type: "queue", queue: this.queueOf(room) });
    this.checkpoint(room);
    return { nextVotes: [...room.nextVotes] };
  }

  private clearBallot(room: Room, userId: string) {
    room.nextVotes.delete(userId);
    for (const item of room.queue.values()) item.votes.delete(userId);
  }

  private async advanceMain(room: Room) {
    if (!this.program || this.advancing.has(room.code)) return;
    this.advancing.add(room.code);
    try {
      const winner = this.queueOf(room).find((item) => item.votes.length > room.nextVotes.size);
      let pick = winner ? await this.program(winner.anime.id, 1) : null;
      pick ??= await this.program(room.anime.id, room.playback.episode + 1);
      pick ??= await this.program();
      if (!pick || !this.rooms.has(room.code)) return;
      this.count(room);
      room.anime = pick.anime;
      room.durationSeconds = pick.durationSeconds;
      room.availableEpisodes = pick.availableEpisodes ?? [];
      room.playback = { episode: pick.episode, playing: true, position: 0, updatedAt: Date.now(), by: null, waitingFor: null, sourceId: pick.sourceId ?? null };
      room.queue.clear(); room.nextVotes.clear();
      const onlineIds = new Set([...room.streams.values()].map((stream) => stream.personId));
      for (const personId of room.people.keys()) if (!onlineIds.has(personId)) room.people.delete(personId);
      room.titles.set(pick.anime.id, pick.anime.titleLocalized || pick.anime.title);
      this.broadcast(room, { type: "anime", anime: room.anime });
      this.broadcast(room, { type: "playback", playback: room.playback, now: Date.now() });
      this.broadcast(room, { type: "ballot", nextVotes: [] });
      this.broadcast(room, { type: "queue", queue: [] });
      this.say(room, `Началась ${pick.episode} серия: ${pick.anime.titleLocalized || pick.anime.title}`);
      this.broadcast(room, { type: "hello", party: this.snapshot(room.code) });
      this.checkpoint(room);
    } catch { /* Keep the current program visible; a later sweep retries the provider. */ }
    finally { this.advancing.delete(room.code); }
  }
}

function expected(p: PartyPlayback): number {
  return p.playing ? p.position + (Date.now() - p.updatedAt) / 1000 : p.position;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
