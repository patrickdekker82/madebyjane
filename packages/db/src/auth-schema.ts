import {
  pgSchema,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
const identity = pgSchema("identity");
const time = (name: string) => timestamp(name, { withTimezone: true });
export const user = identity.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("twoFactorEnabled").notNull().default(false),
  createdAt: time("createdAt").notNull().defaultNow(),
  updatedAt: time("updatedAt").notNull().defaultNow(),
});
export const session = identity.table("session", {
  id: text("id").primaryKey(),
  expiresAt: time("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: time("createdAt").notNull().defaultNow(),
  updatedAt: time("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
});
export const account = identity.table("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  issuer: text("issuer").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: time("accessTokenExpiresAt"),
  refreshTokenExpiresAt: time("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: time("createdAt").notNull().defaultNow(),
  updatedAt: time("updatedAt").notNull().defaultNow(),
});
export const verification = identity.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expiresAt").notNull(),
  createdAt: time("createdAt").notNull().defaultNow(),
  updatedAt: time("updatedAt").notNull().defaultNow(),
});

export const twoFactor = identity.table("twoFactor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  verified: boolean("verified").notNull().default(true),
  failedVerificationCount: integer("failedVerificationCount")
    .notNull()
    .default(0),
  lockedUntil: time("lockedUntil"),
});
