import { z } from "zod";

/** Validated environment. The API refuses to start with missing or weak settings. */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Signs session JWTs. Must match the web app's AUTH_SECRET (its middleware verifies them). */
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  /** Browser origin allowed to call the API directly (CORS). The web app normally proxies /api. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Max login/register attempts per IP per minute (brute-force protection). Raise only for tests. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  /**
   * Number of proxy hops in front of the API (Render's load balancer, plus Vercel's /api rewrite).
   * Lets rate limiting see the real client IP instead of the proxy's. 0 = direct (local dev).
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Secure cookies require HTTPS; defaults on in production. */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type AppConfig = z.infer<typeof envSchema> & { cookieSecure: boolean };

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid API environment — ${problems}`);
  }
  const config = {
    ...parsed.data,
    cookieSecure: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === "production",
  };
  if (env === process.env) cached = config;
  return config;
}

export const SESSION_COOKIE = "bn_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days
