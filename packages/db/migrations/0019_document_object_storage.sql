-- Offerte-PDF's, presentatie-PDF's en PowerPoint-exports verhuizen naar de
-- opslagprovider. Dit zijn de grootste bestanden in de database: 20 MB per
-- offerte-PDF en 40 MB per presentatiebestand, tegen 16 MB voor een onderlegger.
-- Bestaande rijen houden hun bytes tot een beheerder ze verplaatst.
DO $$ DECLARE tab text; kolom text; BEGIN
 FOREACH tab IN ARRAY ARRAY['quote_exports','presentation_exports','presentation_decks'] LOOP
  kolom := CASE WHEN tab = 'presentation_decks' THEN 'pptx' ELSE 'pdf' END;
  -- Opaque sleutel per rij; de opslag kent geen tabelnamen of volgnummers.
  EXECUTE format('ALTER TABLE %I ADD COLUMN asset_id uuid NOT NULL DEFAULT gen_random_uuid()', tab);
  EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', tab, kolom);
  EXECUTE format('ALTER TABLE %I ADD COLUMN stored boolean NOT NULL DEFAULT false', tab);
  EXECUTE format('ALTER TABLE %I ADD COLUMN byte_size integer', tab);
  EXECUTE format('UPDATE %I SET byte_size = octet_length(%I) WHERE byte_size IS NULL', tab, kolom);
  -- Nooit allebei leeg: een rij wijst naar de opslag of draagt de bytes zelf.
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (stored OR %I IS NOT NULL)', tab, tab || '_bytes_somewhere', kolom);
  EXECUTE format('GRANT UPDATE(%I,stored,byte_size) ON %I TO studio_runtime', kolom, tab);
  EXECUTE format('CREATE UNIQUE INDEX %I ON %I(organization_id,asset_id)', tab || '_asset', tab);
 END LOOP;
END $$;
