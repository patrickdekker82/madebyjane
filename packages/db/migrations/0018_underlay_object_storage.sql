-- Onderleggerafbeeldingen verhuizen naar de opslagprovider. Bestaande rijen
-- houden hun bytes in de database tot een beheerder ze verplaatst; de kolom
-- byte_size maakt de quotacontrole onafhankelijk van waar de bytes staan.
ALTER TABLE underlay_assets ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE underlay_assets ADD COLUMN stored boolean NOT NULL DEFAULT false;
ALTER TABLE underlay_assets ADD COLUMN byte_size integer;
UPDATE underlay_assets SET byte_size = octet_length(bytes) WHERE byte_size IS NULL;
ALTER TABLE underlay_assets ADD CONSTRAINT underlay_byte_size_known CHECK (byte_size IS NULL OR byte_size BETWEEN 24 AND 16777216);
-- Een rij zonder bytes moet in de opslag staan, en andersom: nooit allebei leeg.
ALTER TABLE underlay_assets ADD CONSTRAINT underlay_bytes_somewhere CHECK (stored OR bytes IS NOT NULL);
GRANT UPDATE(bytes,stored,byte_size) ON underlay_assets TO studio_runtime;
