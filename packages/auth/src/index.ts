import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import * as schema from "../../db/src/auth-schema";
/**
 * `onResetToken` vervangt het versturen van een herstelmail. Er is bewust geen
 * e-mailkoppeling: de beheerder geeft de eenmalige link zelf door, net als bij
 * uitnodigingen. Zonder deze functie weigert Better Auth herstel volledig.
 */
export function createAuth(
  pool: Pool | PoolClient,
  baseURL: string,
  secret: string,
  setup = false,
  onResetToken?: (token: string, userId: string) => void | Promise<void>,
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
      // Herstel trekt alle bestaande sessies in: wie de toegang kwijt was,
      // wil juist dat een eventuele indringer er ook uit ligt.
      revokeSessionsOnPasswordReset: true,
      // Twee uur is ruim voor een link die persoonlijk wordt doorgegeven.
      resetPasswordTokenExpiresIn: 7200,
      ...(onResetToken
        ? {
            sendResetPassword: async ({
              user,
              token,
            }: {
              user: { id: string };
              token: string;
            }) => {
              await onResetToken(token, user.id);
            },
          }
        : {}),
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
