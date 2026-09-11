ALTER TABLE identity.access_event ADD COLUMN detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(octet_length(detail::text)<=2000);
