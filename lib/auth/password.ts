import bcrypt from "bcryptjs";

/** Cost factor 12 ≈ 250ms per hash on a modern CPU — slow enough to resist brute force. */
const SALT_ROUNDS = 12;

/**
 * A real hash, computed once on first use. Comparing against it when a user isn't found keeps
 * login timing the same whether or not the email exists (prevents user enumeration).
 */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("timing-safe-placeholder", SALT_ROUNDS));

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Verifies a password. Pass `null` as the hash when no user exists to keep timing constant. */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? (await getDummyHash()));
  return hash !== null && ok;
}
