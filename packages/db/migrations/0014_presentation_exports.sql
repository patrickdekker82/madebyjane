-- PowerPoint hoort bij dezelfde onveranderlijke versie als de PDF, maar in een
-- eigen rij: een gepubliceerde export wordt nooit overschreven.
CREATE TABLE presentation_decks (
 organization_id uuid NOT NULL,presentation_id uuid NOT NULL,version integer NOT NULL,
 content_hash text NOT NULL,pptx bytea NOT NULL CHECK(octet_length(pptx)<=40000000),pptx_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,presentation_id,version),
 FOREIGN KEY(organization_id,presentation_id,version) REFERENCES presentation_versions(organization_id,presentation_id,version)
);
/*
 * Exporttaken.
 *
 * Een taak verwijst naar een onveranderlijke versie en niet naar een blob, dus
 * opnieuw uitvoeren levert hetzelfde resultaat. De uniciteit op
 * (presentatie, versie, formaat) maakt hem idempotent: twee keer dezelfde
 * export vragen geeft dezelfde taak. Een taak die halverwege afbrak blijft op
 * 'running' staan met zijn starttijd, zodat een herstart hem kan oppakken;
 * pas bij 'done' staat het bestand er echt en is het te downloaden.
 */
CREATE TABLE export_jobs (
 organization_id uuid NOT NULL,id uuid NOT NULL,
 presentation_id uuid NOT NULL,version integer NOT NULL,
 format text NOT NULL CHECK(format IN ('pdf','pptx')),
 status text NOT NULL CHECK(status IN ('queued','running','done','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 input_revision text NOT NULL,
 result_hash text,error text,
 started_at timestamptz,finished_at timestamptz,
 user_id text NOT NULL REFERENCES identity."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,presentation_id,version,format),
 FOREIGN KEY(organization_id,presentation_id,version) REFERENCES presentation_versions(organization_id,presentation_id,version)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['presentation_decks','export_jobs'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid)',tab);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO studio_runtime',tab);
 END LOOP;
END $$;
-- De taakstatus mag veranderen; het resultaat en de invoer nooit.
GRANT UPDATE(status,attempts,result_hash,error,started_at,finished_at) ON export_jobs TO studio_runtime;
CREATE INDEX export_job_open ON export_jobs(organization_id,status,created_at);
