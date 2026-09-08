CREATE TABLE quote_versions (
 organization_id uuid NOT NULL,
 project_id uuid NOT NULL,
 id uuid NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 request_id uuid NOT NULL,
 input_hash text NOT NULL,
 number text,
 definition jsonb NOT NULL CHECK(octet_length(definition::text) <= 500000),
 totals jsonb NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id,version),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 UNIQUE(organization_id,request_id),
 UNIQUE(organization_id,number)
);
CREATE TABLE quote_sequences (
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 year integer NOT NULL CHECK(year BETWEEN 2000 AND 2099),
 value integer NOT NULL CHECK(value > 0),
 PRIMARY KEY(organization_id,year)
);
ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quote_versions USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE quote_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quote_sequences USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON quote_versions TO studio_runtime;
GRANT SELECT,INSERT,UPDATE ON quote_sequences TO studio_runtime;
CREATE INDEX quote_project_idx ON quote_versions(organization_id,project_id,id,version DESC);
