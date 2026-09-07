CREATE TABLE material_versions (
 organization_id uuid NOT NULL,
 project_id uuid NOT NULL,
 entry_id uuid NOT NULL,
 id uuid NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 definition jsonb NOT NULL CHECK(octet_length(definition::text) <= 20000),
 user_id text NOT NULL REFERENCES identity."user"(id),
 input_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 UNIQUE(organization_id,project_id,entry_id,version)
);
ALTER TABLE material_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON material_versions USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON material_versions TO studio_runtime;
CREATE INDEX material_project_idx ON material_versions(organization_id,project_id,entry_id,version DESC);
