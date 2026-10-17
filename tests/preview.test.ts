import assert from "node:assert/strict";
import { test } from "node:test";
import { AnimeThemesClient } from "../packages/animethemes/src/index.ts";
import { PreviewService } from "../apps/api/src/services/preview.service.ts";

test("preview uses an exact MAL match, coalesces requests and rejects unexpected hosts", async () => {
  let count = 0;
  const client = new AnimeThemesClient({ minIntervalMs: 0, fetchImpl: async (url) => {
    count++;
    assert.ok(String(url).includes("filter%5Bexternal_id%5D=21"));
    return Response.json({ anime: [{ slug: "one_piece", animethemes: [{ type: "OP", sequence: 1, animethemeentries: [{ videos: [{ link: "https://v.animethemes.moe/OnePiece-OP1.webm", nc: true }] }] }] }] });
  } });
  const service = new PreviewService(client);
  const [a, b] = await Promise.all([service.get(21), service.get(21)]);
  assert.equal(a?.url, "https://v.animethemes.moe/OnePiece-OP1.webm");
  assert.deepEqual(a, b);
  await service.get(21);
  assert.equal(count, 1);
  const bad = new PreviewService(new AnimeThemesClient({ minIntervalMs: 0, fetchImpl: async () => Response.json({ anime: [{ animethemes: [{ type: "OP", animethemeentries: [{ videos: [{ link: "https://unknown.example/video.webm" }] }] }] }] }) }));
  assert.equal(await bad.get(21), null);
});
