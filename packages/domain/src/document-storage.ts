import { randomUUID } from "node:crypto";
import type { StorageProvider } from "../../storage/src/index";

/**
 * Offerte-PDF's, presentatie-PDF's en PowerPoint-exports staan in de
 * opslagprovider, niet in de database. Dit zijn de grootste bestanden die de
 * app maakt — tot 40 MB per stuk — en ze horen niet in elke databasedump.
 *
 * Net als bij de onderleggers staat "waar staan de bytes" op precies één plek.
 * Rijen van vóór migration 0019 dragen hun bytes nog in de kolom; `stored`
 * zegt welke van de twee het is.
 */
export type StoredBlobRow = { stored: boolean; asset_id: string };

/** Schrijft de bytes weg en geeft terug wat de rij moet vastleggen. */
export async function storeDocument(
  storage: StorageProvider,
  organizationId: string,
  bytes: Buffer,
): Promise<{ assetId: string; size: number }> {
  const assetId = randomUUID();
  await storage.put({ organizationId, assetId }, bytes);
  return { assetId, size: bytes.length };
}

/**
 * Haalt de bytes op, waar ze ook staan. `inline` is de waarde van de
 * blobkolom: gevuld bij oude rijen, leeg zodra de bytes zijn verhuisd.
 */
export async function documentBytes(
  storage: StorageProvider,
  organizationId: string,
  row: StoredBlobRow,
  inline: Buffer | null,
): Promise<Buffer> {
  if (!row.stored) {
    if (!inline)
      throw new Error("Bestand ontbreekt: geen bytes en niet in de opslag.");
    return inline;
  }
  return Buffer.from(
    await storage.get({ organizationId, assetId: row.asset_id }),
  );
}

/**
 * Ruimt een net weggeschreven object op wanneer het vastleggen alsnog mislukt,
 * zodat er geen weesbestand achterblijft. Fouten hierbij mogen de oorspronkelijke
 * fout niet verdringen.
 */
export async function discardDocument(
  storage: StorageProvider,
  organizationId: string,
  assetId: string,
) {
  await storage.delete({ organizationId, assetId }).catch(() => {});
}
