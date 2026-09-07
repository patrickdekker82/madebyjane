ALTER TABLE identity."user" ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false;
CREATE TABLE identity."twoFactor" (
 id text PRIMARY KEY,
 secret text NOT NULL,
 "backupCodes" text NOT NULL,
 "userId" text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
 verified boolean NOT NULL DEFAULT true,
 "failedVerificationCount" integer NOT NULL DEFAULT 0,
 "lockedUntil" timestamptz
);
CREATE INDEX two_factor_user_idx ON identity."twoFactor"("userId");
CREATE INDEX two_factor_secret_idx ON identity."twoFactor"(secret);
GRANT SELECT,INSERT,UPDATE,DELETE ON identity."twoFactor" TO studio_auth;
