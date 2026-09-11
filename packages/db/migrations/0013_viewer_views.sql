CREATE TABLE viewer_views (
 organization_id uuid NOT NULL,
 variant_id uuid NOT NULL,
 id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 revision integer NOT NULL CHECK(revision>=0),
 camera jsonb NOT NULL,
 settings jsonb NOT NULL,
 input_hash text NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES design_variants(organization_id,id)
);
ALTER TABLE viewer_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewer_views FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON viewer_views
 USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON viewer_views TO studio_runtime;
CREATE INDEX viewer_views_variant ON viewer_views(organization_id,variant_id,created_at DESC);
