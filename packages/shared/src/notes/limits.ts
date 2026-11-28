/** Size limits shared by the editor (client) and the API's validation. Zod-free. */
export const TITLE_MAX = 200;
/** Plain-text cap (~20k words) — far beyond any real file note. */
export const CONTENT_TEXT_MAX = 100_000;
/** Serialized JSON cap, protects the DB and server from oversized payloads. */
export const CONTENT_JSON_MAX_BYTES = 512 * 1024;
