CREATE TABLE presentations (
 organization_id uuid NOT NULL,project_id uuid NOT NULL,id uuid NOT NULL,
 definition jsonb NOT NULL CHECK(octet_length(definition::text)<=500000),
 published_version integer,
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE presentation_versions (
 organization_id uuid NOT NULL,presentation_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 request_id uuid NOT NULL,input_hash text NOT NULL,
 definition jsonb NOT NULL CHECK(octet_length(definition::text)<=500000),
 content jsonb NOT NULL CHECK(octet_length(content::text)<=24000000),
 content_hash text NOT NULL,template_version text NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,presentation_id,version),
 UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,presentation_id) REFERENCES presentations(organization_id,id)
);
CREATE TABLE presentation_exports (
 organization_id uuid NOT NULL,presentation_id uuid NOT NULL,version integer NOT NULL,
 content_hash text NOT NULL,pdf bytea NOT NULL CHECK(octet_length(pdf)<=40000000),pdf_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,presentation_id,version),
 FOREIGN KEY(organization_id,presentation_id,version) REFERENCES presentation_versions(organization_id,presentation_id,version)
);
CREATE TABLE presentation_shares (
 organization_id uuid NOT NULL,id uuid NOT NULL,presentation_id uuid NOT NULL,version integer NOT NULL,
 token_hash text NOT NULL,input_hash text NOT NULL,user_id text NOT NULL REFERENCES identity."user"(id),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),UNIQUE(organization_id,token_hash),
 FOREIGN KEY(organization_id,presentation_id,version) REFERENCES presentation_versions(organization_id,presentation_id,version)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['presentations','presentation_versions','presentation_exports','presentation_shares'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid)',tab);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO studio_runtime',tab);
 END LOOP;
END $$;
-- Een concept is bewerkbaar; gepubliceerde versies zijn dat nooit.
GRANT UPDATE(definition,published_version,updated_at) ON presentations TO studio_runtime;
GRANT UPDATE(revoked_at) ON presentation_shares TO studio_runtime;
CREATE INDEX presentation_project ON presentations(organization_id,project_id,updated_at DESC);
CREATE INDEX presentation_version_idx ON presentation_versions(organization_id,presentation_id,version DESC);
