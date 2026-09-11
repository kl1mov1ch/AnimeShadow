// Open-testing helper: give every existing account PRO. New registrations
// already get it automatically when PRO_FOR_ALL=true (see auth.service.ts);
// this backfills anyone who signed up before that, or after PRO_FOR_ALL was
// briefly off. Safe to re-run — it only touches accounts without PRO yet.
import { prisma } from "../dist/index.js";

const { count } = await prisma.user.updateMany({
  where: { proSince: null },
  data: { proSince: new Date() },
});

const total = await prisma.user.count();
console.log(`granted PRO to ${count} account(s); ${total} total, all PRO now`);
await prisma.$disconnect();
