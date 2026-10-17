import "../apps/api/src/config/env.js";
import { prisma } from "../packages/db/src/index.js";
import { LandingService } from "../apps/api/src/services/landing.service.js";
import { SeoRenderer } from "../apps/api/src/seo/render.js";
try {
  const renderer = new SeoRenderer({ prisma, landing: new LandingService({ prisma }), logger: { warn: (value) => {
    const error = (value as { error?: Error }).error;
    console.log(JSON.stringify({ error: error?.message, stack: error?.stack?.split("\n").slice(0, 4) }));
  } } });
  for (const path of ["/", "/browse?page=2", "/anime/5114-fullmetal-alchemist-brotherhood"]) {
    const result = await renderer.render(path);
    console.log(JSON.stringify({ path, status: result.status, h1: /<h1[\s>]/i.test(result.html ?? ""), title: /<title>(.*?)<\/title>/s.exec(result.html ?? "")?.[1] }));
  }
} finally { await prisma.$disconnect(); }
