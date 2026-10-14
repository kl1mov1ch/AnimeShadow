import { z } from "zod";

/** Watching together: one room, up to this many people at once. */
export const PARTY_MAX = 10;

export interface PartyMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  host: boolean;
}

export interface PartyPlayback {
  episode: number;
  playing: boolean;
  /** Seconds, as of `updatedAt` (server ms). */
  position: number;
  updatedAt: number;
  /** Who did it last (a member id), for "Аня поставила паузу". */
  by: string | null;
}

export interface PartyChatMessage {
  id: string;
  at: number;
  /** null: a line from the room itself ("Аня присоединилась"). */
  author: { id: string; name: string; avatarUrl: string | null } | null;
  text: string;
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
  | { type: "members"; members: PartyMember[]; now: number }
  | { type: "playback"; playback: PartyPlayback; now: number }
  | { type: "chat"; message: PartyChatMessage }
  | { type: "reaction"; emoji: string; by: string; name: string }
  | { type: "ping"; now: number };

export const createPartyInputSchema = z.object({
  animeId: z.number().int().positive(),
  episode: z.number().int().min(1).max(5000).default(1),
});

export const partyPlaybackInputSchema = z.object({
  episode: z.number().int().min(1).max(5000),
  playing: z.boolean(),
  position: z.number().min(0).max(36_000),
});

export const partyChatInputSchema = z.object({ text: z.string().trim().min(1).max(500) });

export const PARTY_REACTIONS = ["😂", "😭", "🔥", "❤️", "😮", "👏"] as const;
export const partyReactionInputSchema = z.object({ emoji: z.enum(PARTY_REACTIONS) });
