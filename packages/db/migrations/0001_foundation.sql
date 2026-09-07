CREATE SCHEMA IF NOT EXISTS identity;
CREATE TABLE identity."user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, "emailVerified" boolean NOT NULL DEFAULT false, image text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE identity.session (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE);
CREATE INDEX session_user_idx ON identity.session("userId");
CREATE TABLE identity.account (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("providerId","accountId"));
CREATE INDEX account_user_idx ON identity.account("userId");
CREATE TABLE identity.verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX verification_identifier_idx ON identity.verification(identifier);
CREATE TABLE identity.organization (id uuid PRIMARY KEY, name varchar(120) NOT NULL);
CREATE TABLE identity.membership (organization_id uuid NOT NULL REFERENCES identity.organization(id), user_id text NOT NULL REFERENCES identity."user"(id), role text NOT NULL CHECK(role IN ('owner','admin','designer','finance','viewer')), PRIMARY KEY(organization_id,user_id));
CREATE INDEX membership_user_idx ON identity.membership(user_id);
CREATE TABLE projects (organization_id uuid NOT NULL REFERENCES identity.organization(id), id uuid NOT NULL, name varchar(120) NOT NULL, customer varchar(160) NOT NULL DEFAULT '', description varchar(2000) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,id));
CREATE TABLE design_variants (organization_id uuid NOT NULL, id uuid NOT NULL, project_id uuid NOT NULL, name varchar(120) NOT NULL, PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id));
CREATE INDEX variant_project_idx ON design_variants(organization_id,project_id);
CREATE TABLE design_documents (organization_id uuid NOT NULL, variant_id uuid NOT NULL, floor_id uuid NOT NULL, revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), document jsonb NOT NULL CHECK(octet_length(document::text)<=2000000), PRIMARY KEY(organization_id,variant_id), FOREIGN KEY(organization_id,variant_id) REFERENCES design_variants(organization_id,id));
CREATE TABLE command_receipts (organization_id uuid NOT NULL, variant_id uuid NOT NULL, command_id uuid NOT NULL, user_id text NOT NULL REFERENCES identity."user"(id), input_hash text NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,variant_id,command_id), FOREIGN KEY(organization_id,variant_id) REFERENCES design_variants(organization_id,id));
CREATE TABLE editing_leases (organization_id uuid NOT NULL, variant_id uuid NOT NULL, lease_id uuid NOT NULL, user_id text NOT NULL REFERENCES identity."user"(id), expires_at timestamptz NOT NULL, PRIMARY KEY(organization_id,variant_id), FOREIGN KEY(organization_id,variant_id) REFERENCES design_variants(organization_id,id));
CREATE TABLE design_revisions (organization_id uuid NOT NULL, variant_id uuid NOT NULL, id uuid NOT NULL, name varchar(120) NOT NULL, revision integer NOT NULL, document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES design_variants(organization_id,id));
CREATE TABLE audit_events (organization_id uuid NOT NULL REFERENCES identity.organization(id), id uuid NOT NULL, user_id text NOT NULL, action varchar(100) NOT NULL, subject_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,id));
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='studio_runtime') THEN CREATE ROLE studio_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='studio_auth') THEN CREATE ROLE studio_auth NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO studio_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON projects,design_variants,design_documents,command_receipts,editing_leases TO studio_runtime;
GRANT SELECT,INSERT ON design_revisions,audit_events TO studio_runtime;
GRANT USAGE ON SCHEMA identity TO studio_auth;
GRANT SELECT,INSERT,UPDATE,DELETE ON identity."user",identity.session,identity.account,identity.verification TO studio_auth;
GRANT SELECT ON identity.organization,identity.membership TO studio_auth;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['projects','design_variants','design_documents','command_receipts','editing_leases','design_revisions','audit_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO studio_runtime USING (organization_id::text = nullif(current_setting(''app.organization_id'',true),'''')) WITH CHECK (organization_id::text = nullif(current_setting(''app.organization_id'',true),''''))',tab);
 END LOOP;
END $$;
