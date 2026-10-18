import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@animeshadow/db";
import type { ServerResponse } from "node:http";
import { createPartyInputSchema } from "../packages/shared/src/party.ts";
import { isHonKonSource } from "../packages/shared/src/studios.ts";
import { PartyService } from "../apps/api/src/services/party.service.ts";
import { encodeRoom, decodeRoom } from "../apps/api/src/services/party-codec.ts";
import { createPartyProgram } from "../apps/api/src/services/party-program.ts";
import type { DeliveryService } from "../apps/api/src/services/delivery.service.ts";
import type { WatchResponse } from "../packages/shared/src/watch.ts";

const anime = {
  id: 64534,
  slug: "64534-ice",
  title: "Ice",
  titleLocalized: null,
  imageUrl: null,
  episodes: 3,
};
const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      displayName: where.id,
      avatarUrl: null,
      proSince: new Date(1),
      proUntil: null,
      trialUntil: null,
    }),
  },
  anime: { findUnique: async () => anime, findMany: async () => [anime] },
} as unknown as PrismaClient;
const stream = () =>
  ({
    writableEnded: false,
    destroyed: false,
    writableLength: 0,
    write() {},
    end() {},
  }) as unknown as ServerResponse;
const delivery = { room: async () => 0 } as unknown as DeliveryService;

test("studio program selects the actual dub and preserves episode holes", async () => {
  const source = (id: string, title: string, episodes: string[]) => ({
    id,
    title,
    format: "hls",
    kind: "voice",
    embedUrl: "",
    hlsEpisodes: Object.fromEntries(
      episodes.map((n) => [n, `https://media.test/${id}/${n}.m3u8`]),
    ),
  });
  const program = createPartyProgram(prisma, {
    getSources: async () =>
      ({
        sources: [
          source("other", "Other Studio", ["1", "2", "3"]),
          source("kodik:4167", "hon-kon studio", ["1", "3"]),
        ],
        available: true,
      }) as WatchResponse,
  });
  assert.equal((await program(anime.id, 1, "hon-kon"))?.sourceId, "kodik:4167");
  assert.deepEqual((await program(anime.id, 1, "hon-kon"))?.availableEpisodes, [1, 3]);
  assert.equal(await program(anime.id, 2, "hon-kon"), null);
  assert.equal(
    isHonKonSource({ id: "other", title: "Other Hon-Kon Fan Studio" }),
    false,
  );
});

test("studio room applies capacity and startup settings, rejects dub changes and unavailable episodes", async (t) => {
  const program = async (id = anime.id, episode = 1, studio?: string | null) =>
    id === anime.id && episode !== 2 && studio === "hon-kon"
      ? {
          anime,
          episode,
          durationSeconds: 1500,
          sourceId: "kodik:4167",
          availableEpisodes: [1, 3],
        }
      : null;
  const service = new PartyService(
    prisma,
    delivery,
    "https://example.test",
    "__unused__",
    undefined,
    program,
  );
  t.after(() => service.dispose());
  const options = createPartyInputSchema.parse({
    animeId: anime.id,
    capacity: 2,
    studio: "hon-kon",
    visibility: "link",
    allControl: true,
    waitForSlow: false,
    autoNext: false,
  });
  const { code } = await service.create(
    "creator",
    anime.id,
    1,
    options.visibility,
    "Hon-Kon",
    options,
  );
  const disconnect = await service.connect(code, "creator", stream());
  const guest = await service.connect(code, "guest", stream());
  t.after(disconnect);
  t.after(guest);
  const initial = service.snapshot(code);
  assert.equal(initial.capacity, 2);
  assert.equal(initial.studio, "hon-kon");
  assert.equal(initial.playback.sourceId, "kodik:4167");
  assert.equal(initial.settings.allControl, true);
  assert.equal(initial.settings.autoNext, false);
  assert.equal(initial.settings.waitForSlow, false);
  await assert.rejects(service.connect(code, "third", stream()), /2 человек/);
  await assert.rejects(
    service.playback(code, "creator", {
      episode: 1,
      playing: true,
      position: 0,
      sourceId: "other",
    }),
    /закреплена/,
  );
  await assert.rejects(
    service.playback(code, "creator", { episode: 2, playing: true, position: 0 }),
    /нет озвучки/,
  );
  assert.equal(service.snapshot(code).playback.episode, 1);
  await service.playback(code, "guest", { episode: 3, playing: true, position: 0 });
  assert.equal(service.snapshot(code).playback.episode, 3);
  assert.equal(service.snapshot(code).playback.sourceId, "kodik:4167");
  const room = (
    service as unknown as { rooms: Map<string, Parameters<typeof encodeRoom>[0]> }
  ).rooms.get(code)!;
  const restored = decodeRoom(encodeRoom(room))!;
  assert.equal(restored.capacity, 2);
  assert.equal(restored.studio, "hon-kon");
  assert.equal(restored.playback.sourceId, "kodik:4167");
  await assert.rejects(service.propose(code, "creator", 999, 1), /только серии/);
  assert.equal(
    createPartyInputSchema.safeParse({ animeId: 1, capacity: 11 }).success,
    false,
  );
  assert.equal(
    createPartyInputSchema.safeParse({ animeId: 1, studio: "other" }).success,
    false,
  );
});
