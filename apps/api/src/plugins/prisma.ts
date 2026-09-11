import { pingDatabase, prisma } from "@animeshadow/db";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
    databaseHealthy: () => Promise<boolean>;
  }
}

export default fp(
  async (fastify) => {
    fastify.decorate("prisma", prisma);
    fastify.decorate("databaseHealthy", pingDatabase);

    fastify.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  },
  { name: "prisma" },
);
