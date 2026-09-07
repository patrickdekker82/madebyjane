CREATE TABLE library_versions (
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 entry_id uuid NOT NULL,
 id uuid NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 definition jsonb NOT NULL CHECK(octet_length(definition::text) <= 10000),
 user_id text NOT NULL REFERENCES identity."user"(id),
 input_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,entry_id,version)
);
ALTER TABLE library_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON library_versions USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON library_versions TO studio_runtime;
