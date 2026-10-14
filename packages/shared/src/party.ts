import { z } from "zod";

/** Watching together: one room, up to this many people at once. */
export const PARTY_MAX = 10;

export interface PartyMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  host: boolean;
  pro: boolean;
  /** The line's speed this member reports, Mbit/s (null: unknown, e.g. Kodik's player). */
  mbps: number | null;
}

export interface PartyPlayback {
  episode: number;
  playing: boolean;
  /** Seconds, as of `updatedAt` (server ms). */
  position: number;
  updatedAt: number;
  /** Who did it last (a member id), for "Аня поставила паузу". */
  by: string | null;
  /** Paused for someone still loading: their name. */
  waitingFor: string | null;
}

export interface PartyChatMessage {
  id: string;
  at: number;
  /** null: a line from the room itself ("Аня присоединилась"). */
  author: { id: string; name: string; avatarUrl: string | null; pro: boolean } | null;
  /** text: words (PRO); emoji: only emoji (everyone); sticker / gif: a picture (PRO). */
  kind: "text" | "emoji" | "sticker" | "gif" | "system";
  text: string;
  /** A sticker's code or a GIF's file name. */
  media: string | null;
}

export interface PartySnapshot {
  code: string;
  anime: { id: number; slug: string; title: string; titleLocalized: string | null; imageUrl: string | null; episodes: number | null };
  hostId: string;
  members: PartyMember[];
  playback: PartyPlayback;
  chat: PartyChatMessage[];
  /** Server clock, to work out where playback is now. */
  now: number;
}

/** What arrives over the room's event stream. */
export type PartyEvent =
  | { type: "hello"; party: PartySnapshot }
  | { type: "members"; members: PartyMember[]; now: number; capHeight: number | null }
  | { type: "playback"; playback: PartyPlayback; now: number }
  | { type: "anime"; anime: PartySnapshot["anime"] }
  | { type: "chat"; message: PartyChatMessage }
  | { type: "reaction"; emoji: string; by: string; name: string }
  | { type: "ping"; now: number };

export const createPartyInputSchema = z.object({
  animeId: z.number().int().positive(),
  episode: z.number().int().min(1).max(5000).default(1),
});

export const partyPlaybackInputSchema = z.object({
  /** Paused because this member is still loading (it resumes when they're ready). */
  waiting: z.boolean().optional(),
  /** Another title for the whole room (anyone may switch it). */
  animeId: z.number().int().positive().optional(),
  episode: z.number().int().min(1).max(5000),
  playing: z.boolean(),
  position: z.number().min(0).max(36_000),
});

/**
 * Animated stickers: Google's Noto Animated Emoji (CC BY 4.0), by code point.
 * https://googlefonts.github.io/noto-emoji-animation/
 */
export const PARTY_STICKERS = [
  { code: "1f602", label: "Смех до слёз" },
  { code: "1f62d", label: "Рыдаю" },
  { code: "1f970", label: "Влюблённость" },
  { code: "1f60d", label: "Восторг" },
  { code: "1f929", label: "Звёзды в глазах" },
  { code: "1f92f", label: "Взрыв мозга" },
  { code: "1f631", label: "Ужас" },
  { code: "1f525", label: "Огонь" },
  { code: "2764_fe0f", label: "Сердце" },
  { code: "1f494", label: "Разбитое сердце" },
  { code: "1f44f", label: "Аплодисменты" },
  { code: "1f389", label: "Праздник" },
  { code: "1f621", label: "Злость" },
  { code: "1f914", label: "Хмм" },
  { code: "1f634", label: "Сплю" },
  { code: "1f480", label: "Я умер" },
  { code: "1f440", label: "Глаза" },
  { code: "1f97a", label: "Ну пожалуйста" },
  { code: "1f60e", label: "Круто" },
  { code: "1f60f", label: "Ухмылка" },
  { code: "1f648", label: "Не смотрю" },
  { code: "2728", label: "Искры" },
  { code: "1f37f", label: "Попкорн" },
  { code: "1fae1", label: "Честь" },
] as const;

export function stickerUrl(code: string): string {
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
}

/** Emoji anyone can send — the plain ones, no PRO needed. */
export const PARTY_EMOJI = [
  "😂", "🤣", "😭", "🥹", "😍", "🥰", "😘", "😎", "🤩", "😏",
  "😱", "😳", "🤯", "😡", "🤔", "🙄", "😴", "🥱", "💀", "👀",
  "🔥", "❤️", "💔", "💯", "✨", "🎉", "👏", "🙏", "👍", "👎",
  "🍿", "😮", "🫡", "🙈", "😈", "🤝",
] as const;

/** Only emoji (and spaces): what a member without PRO may write. */
export function emojiOnly(text: string): boolean {
  const t = text.replace(/\s+/g, "");
  return t.length > 0 && t.length <= 40 && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{1F1E6}-\u{1F1FF}]|\u200d|\ufe0f)+$/u.test(t);
}

export const partyChatInputSchema = z
  .object({
    text: z.string().trim().max(500).optional(),
    sticker: z.string().max(20).optional(),
    gif: z.string().regex(/^[\w.-]+\.webp$/).max(120).optional(),
  })
  .refine((v) => [v.text, v.sticker, v.gif].filter((x) => x != null && x !== "").length === 1, { message: "One of text, sticker or gif" });

/** How fast this member's line is, for the room's quality cap. */
export const partyNetInputSchema = z.object({ mbps: z.number().min(0).max(1000).nullable() });

export const PARTY_REACTIONS = ["😂", "😭", "🔥", "❤️", "😮", "👏"] as const;
export const partyReactionInputSchema = z.object({ emoji: z.enum(PARTY_REACTIONS) });
