/** Password rules shared by the server schema and client hints (kept zod-free for small bundles). */
export const PASSWORD_MIN = 8;
/** bcrypt only uses the first 72 bytes of a password, so we cap length there. */
export const PASSWORD_MAX = 72;
