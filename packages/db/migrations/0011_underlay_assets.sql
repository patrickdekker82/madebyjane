CREATE TABLE underlay_assets (
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 id uuid NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 24 AND 16777216),
 width_px integer NOT NULL CHECK(width_px BETWEEN 1 AND 20000),
 height_px integer NOT NULL CHECK(height_px BETWEEN 1 AND 20000),
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id)
);
ALTER TABLE underlay_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE underlay_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON underlay_assets USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON underlay_assets TO studio_runtime;
