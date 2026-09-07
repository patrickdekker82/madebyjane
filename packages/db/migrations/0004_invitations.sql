CREATE TABLE identity.invitation (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 email varchar(254) NOT NULL,
 role text NOT NULL CHECK (role IN ('admin','designer','finance','viewer')),
 token_hash char(64) NOT NULL UNIQUE,
 created_by text NOT NULL REFERENCES identity."user"(id),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitation_org_idx ON identity.invitation(organization_id,created_at DESC);
CREATE TABLE identity.access_event (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 actor_id text NOT NULL REFERENCES identity."user"(id),
 action varchar(80) NOT NULL,
 subject_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON identity.invitation TO studio_auth;
GRANT INSERT ON identity.membership TO studio_auth;
GRANT SELECT,INSERT ON identity.access_event TO studio_auth;
GRANT SELECT ON schema_migrations TO studio_runtime;
