ALTER TABLE quote_versions ADD COLUMN frozen jsonb NOT NULL DEFAULT '{"attachments":[]}'::jsonb CHECK(octet_length(frozen::text)<=12000000);
ALTER TABLE quote_versions ADD COLUMN content_hash text;
CREATE TABLE quote_events (
 organization_id uuid NOT NULL,quote_id uuid NOT NULL,quote_version integer NOT NULL,
 event_version integer NOT NULL CHECK(event_version>0),request_id uuid NOT NULL,input_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('sent','accepted','rejected','expired','replaced')),
 occurred_on date NOT NULL,actor text NOT NULL,evidence text NOT NULL,content_hash text NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,quote_id,quote_version,event_version),UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,quote_id,quote_version) REFERENCES quote_versions(organization_id,id,version)
);
CREATE TABLE commercial_prices (
 organization_id uuid NOT NULL,project_id uuid NOT NULL,id uuid NOT NULL,entry_id uuid NOT NULL,version integer NOT NULL,
 definition jsonb NOT NULL,input_hash text NOT NULL,user_id text NOT NULL REFERENCES identity."user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),UNIQUE(organization_id,project_id,entry_id,version),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE quote_attachments (
 organization_id uuid NOT NULL,project_id uuid NOT NULL,id uuid NOT NULL,definition jsonb NOT NULL,
 snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text)<=2000000),input_hash text NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE quote_exports (
 organization_id uuid NOT NULL,quote_id uuid NOT NULL,quote_version integer NOT NULL,
 template_version text NOT NULL,content_hash text NOT NULL,pdf bytea NOT NULL CHECK(octet_length(pdf)<=20000000),pdf_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,quote_id,quote_version),
 FOREIGN KEY(organization_id,quote_id,quote_version) REFERENCES quote_versions(organization_id,id,version)
);
CREATE TABLE quote_shares (
 organization_id uuid NOT NULL,id uuid NOT NULL,quote_id uuid NOT NULL,quote_version integer NOT NULL,
 token_hash text NOT NULL,input_hash text NOT NULL,user_id text NOT NULL REFERENCES identity."user"(id),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),UNIQUE(organization_id,token_hash),
 FOREIGN KEY(organization_id,quote_id,quote_version) REFERENCES quote_exports(organization_id,quote_id,quote_version)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['quote_events','commercial_prices','quote_attachments','quote_exports','quote_shares'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid)',tab);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO studio_runtime',tab);
 END LOOP;
END $$;
GRANT UPDATE(revoked_at) ON quote_shares TO studio_runtime;
CREATE INDEX quote_attachment_project ON quote_attachments(organization_id,project_id);
CREATE INDEX commercial_price_project ON commercial_prices(organization_id,project_id,entry_id,version DESC);
