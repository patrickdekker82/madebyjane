CREATE TABLE variant_copies (
 organization_id uuid NOT NULL,
 variant_id uuid NOT NULL,
 source_variant_id uuid NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),
 input_hash text NOT NULL,
 PRIMARY KEY(organization_id,variant_id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES design_variants(organization_id,id),
 FOREIGN KEY(organization_id,source_variant_id) REFERENCES design_variants(organization_id,id)
);
ALTER TABLE variant_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_copies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON variant_copies USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON variant_copies TO studio_runtime;
