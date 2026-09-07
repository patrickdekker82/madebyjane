import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import * as schema from "../../db/src/auth-schema";
export function createAuth(
  pool: Pool | PoolClient,
  baseURL: string,
  secret: string,
  setup = false,
) {
  if (secret.length < 32)
    throw new Error("AUTH_SECRET moet minimaal 32 tekens bevatten.");
  return betterAuth({
    appName: "Studio",
    plugins: [twoFactor()],
    database: drizzleAdapter(drizzle(pool, { schema }), {
      provider: "pg",
      schema,
    }),
    secret,
    baseURL,
    basePath: "/api/auth",
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !setup,
      autoSignIn: !setup,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-studio-client-ip"] },
      useSecureCookies: baseURL.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    session: { expiresIn: 60 * 60 * 12, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 30 },
  });
}
