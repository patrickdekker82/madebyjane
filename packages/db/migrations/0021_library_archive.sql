-- Een bibliotheekitem dat niet meer gevoerd wordt, bleef voor altijd in elke
-- zoekopdracht opduiken. Er was geen manier om het met rust te laten.
--
-- Archiveren raakt de versies zelf niet aan. Die zijn onveranderlijk — dat is
-- de belofte waar elke geplaatste revisie op steunt — en de runtime-rol heeft
-- op `library_versions` dan ook bewust alleen SELECT en INSERT. Het archief is
-- daarom een eigen tabel: een rij erin betekent "niet meer aanbieden".
--
-- Terughalen is het weghalen van die rij. Wát er ooit is gearchiveerd en door
-- wie blijft leesbaar in audit_events; deze tabel zegt alleen wat nú geldt.
CREATE TABLE library_archived (
 organization_id uuid NOT NULL REFERENCES identity.organization(id),
 entry_id uuid NOT NULL,
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,entry_id)
);
ALTER TABLE library_archived ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_archived FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON library_archived USING (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON library_archived TO studio_runtime;
