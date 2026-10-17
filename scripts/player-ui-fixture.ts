import "../apps/api/src/config/env.js";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { LEGAL_VERSION } from "../packages/shared/src/index.js";
import { prisma } from "../packages/db/src/index.js";

const path = new URL("../logs/qa-player-session.json", import.meta.url);
try {
  if (process.argv[2] === "cleanup") {
    const fixture = JSON.parse(await readFile(path, "utf8")) as { id: string; email: string };
    if (!fixture.id.startsWith("qa-ui-") || !fixture.email.endsWith("@example.invalid")) throw new Error("Not a disposable QA fixture");
    await prisma.user.deleteMany({ where: { id: fixture.id, email: fixture.email } });
    await unlink(path);
    console.log("Disposable UI fixture removed");
  } else {
    const id = `qa-ui-${randomUUID()}`;
    const email = `${id}@example.invalid`;
    const password = randomBytes(18).toString("base64url");
    const { hash } = createRequire(new URL("../apps/api/package.json", import.meta.url))("bcryptjs") as { hash: (value: string, rounds: number) => Promise<string> };
    await prisma.user.create({ data: { id, email, passwordHash: await hash(password, 10), displayName: "Player QA", trialUntil: new Date(Date.now() + 86_400_000), termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION } });
    await mkdir(new URL("../logs/", import.meta.url), { recursive: true });
    await writeFile(path, JSON.stringify({ id, email, password }), { flag: "wx" });
    console.log(JSON.stringify({ email, password }));
  }
} finally { await prisma.$disconnect(); }
