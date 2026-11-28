import { PrismaClient } from "@prisma/client";

import { E2E_EMAIL_DOMAIN } from "./helpers";

/** Removes every brokerage (and, via cascade, its members and notes) created by the E2E run. */
export default async function globalTeardown() {
  const db = new PrismaClient();
  try {
    const { count } = await db.organisation.deleteMany({
      where: { members: { some: { email: { endsWith: `@${E2E_EMAIL_DOMAIN}` } } } },
    });
    console.warn(`[e2e] cleaned up ${count} test brokerage(s)`);
  } finally {
    await db.$disconnect();
  }
}
