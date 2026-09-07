CREATE TABLE model_assets (
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 id uuid NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 source_bytes integer NOT NULL CHECK(source_bytes BETWEEN 28 AND 10485760),
 positions bytea NOT NULL,
 width integer NOT NULL CHECK(width BETWEEN 1 AND 100000),
 depth integer NOT NULL CHECK(depth BETWEEN 1 AND 100000),
 height integer NOT NULL CHECK(height BETWEEN 1 AND 100000),
 triangles integer NOT NULL CHECK(triangles BETWEEN 1 AND 100000),
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),
 CHECK(octet_length(positions) = triangles * 36)
);
ALTER TABLE model_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON model_assets USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON model_assets TO studio_runtime;
