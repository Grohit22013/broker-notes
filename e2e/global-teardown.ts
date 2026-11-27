import { PrismaClient } from "@prisma/client";

import { E2E_EMAIL_DOMAIN } from "./helpers";

/** Removes every account (and, via cascade, every note) created by the E2E run. */
export default async function globalTeardown() {
  const db = new PrismaClient();
  try {
    const { count } = await db.user.deleteMany({
      where: { email: { endsWith: `@${E2E_EMAIL_DOMAIN}` } },
    });
    console.warn(`[e2e] cleaned up ${count} test account(s)`);
  } finally {
    await db.$disconnect();
  }
}
