ALTER TABLE audit_events ADD COLUMN detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(octet_length(detail::text)<=2000);
CREATE INDEX audit_event_subject ON audit_events(organization_id,subject_id,created_at DESC);
