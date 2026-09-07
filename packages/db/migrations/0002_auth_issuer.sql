-- Better Auth 1.7 added issuer-scoped identity. Expand-only; preserve the initial migration.
ALTER TABLE identity.account ADD COLUMN issuer text;
