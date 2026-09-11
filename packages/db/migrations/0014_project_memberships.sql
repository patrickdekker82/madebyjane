ALTER TABLE projects ADD COLUMN access text NOT NULL DEFAULT 'organization' CHECK(access IN ('organization','restricted'));
CREATE TABLE project_memberships (
 organization_id uuid NOT NULL,
 project_id uuid NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),
 role text NOT NULL CHECK(role IN ('designer','finance','viewer')),
 created_by text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,project_id,user_id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_memberships USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON project_memberships TO studio_runtime;
CREATE INDEX project_membership_user ON project_memberships(organization_id,user_id);
