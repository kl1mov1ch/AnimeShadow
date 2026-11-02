import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "../packages/db/src/index.ts";
import { levelOf } from "../packages/shared/src/index.ts";
import { peopleDirectory } from "../apps/api/src/lib/people-directory.ts";
import { AchievementService } from "../apps/api/src/services/achievement.service.ts";
import { ProfileService } from "../apps/api/src/services/profile.service.ts";

test(
  "directory paging, literal search, privacy and displayed XP match real profiles",
  {
    skip: process.env.RUN_PEOPLE_DB_TESTS !== "1",
  },
  async () => {
    const url = new URL(process.env.DATABASE_URL!);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname),
      "Only a local test database is allowed",
    );
    const prisma = new PrismaClient();
    const rollback = new Error("directory-fixture-rollback");
    const token = `dq${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            const data = Array.from({ length: 26 }, (_, index) => ({
              id: `${token}-${String(index).padStart(2, "0")}`,
              email: `${token}-${index}@example.invalid`,
              username: `${token}_${index}`,
              displayName: `${token}-${index}`,
              passwordHash: "unused-disposable-fixture",
              avatarFrame: "shadow-halloween-pumpkin",
              isBanned: index === 25,
              profilePrivacy:
                index >= 23 && index < 25
                  ? { profile: "private" }
                  : index === 22
                    ? { stats: "private" }
                    : {},
            }));
            await tx.user.createMany({ data });
            await tx.user.update({
              where: { id: data[0]!.id },
              data: { displayName: `${token}_%`, bonusXp: 123 },
            });
            const db = tx as unknown as PrismaClient;
            const first = await peopleDirectory(db, token, 1);
            const second = await peopleDirectory(db, token, 2);
            assert.equal(first.items.length, 20);
            assert.equal(first.hasMore, true);
            assert.equal(second.items.length, 3);
            assert.equal(second.hasMore, false);
            const cards = [...first.items, ...second.items];
            assert.equal(new Set(cards.map((card) => card.id)).size, 23);
            assert.ok(
              cards.every(
                (card) => !data.slice(23).some((hidden) => hidden.id === card.id),
              ),
            );
            const privateStats = cards.find((card) => card.id === data[22]!.id)!;
            assert.equal(privateStats.episodes, null);
            assert.equal(privateStats.titlesCompleted, null);
            assert.equal(privateStats.avatarFrame, "shadow-halloween-pumpkin");
            assert.ok(
              cards.every((card) => !("email" in card) && !("passwordHash" in card)),
            );
            const literal = await peopleDirectory(db, `${token}_%`, 1);
            assert.deepEqual(
              literal.items.map((card) => card.id),
              [data[0]!.id],
            );
            const exact = await peopleDirectory(db, `@${data[0]!.username}`, 1);
            assert.deepEqual(
              exact.items.map((card) => card.id),
              [data[0]!.id],
            );
            const profiles = new ProfileService({
              prisma: db,
              achievements: new AchievementService({ prisma: db }),
              uploadsRoot: "unused-directory-test",
            });
            const profile = await profiles.getById(data[0]!.id);
            assert.equal(literal.items[0]!.xp, levelOf(profile).xp);
            throw rollback;
          },
          { timeout: 30_000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
