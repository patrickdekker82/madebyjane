-- Only credential accounts exist in this foundation. Backfill using the observed provider identifier.
UPDATE identity.account SET issuer = "providerId" WHERE issuer IS NULL;
ALTER TABLE identity.account ALTER COLUMN issuer SET NOT NULL;
CREATE UNIQUE INDEX account_issuer_identity_idx ON identity.account(issuer,"accountId");
