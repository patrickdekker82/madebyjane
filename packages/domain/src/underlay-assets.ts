import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import type { StorageProvider } from "../../storage/src/index";
import {
  readImageHeader,
  stripImageMetadata,
  orientationRotation,
  MIRRORED_ORIENTATIONS,
} from "../../image-import/src/index";
import { DomainError, canWrite, requirePermission } from "./index";
import type { Context } from "./projects";

const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Onderleggerafbeeldingen. De bytes worden opgeslagen zoals ze binnenkomen; er
 * wordt op de server niets gedecodeerd, alleen de kop gelezen voor type en
 * maten. Uitleveren gebeurt met een vast, uit die kop afgeleid content-type en
 * met nosniff, zodat de browser er nooit iets anders van kan maken.
 */
/**
 * Waar de bytes van een onderlegger staan, staat op precies één plek: hier.
 * Rijen van vóór migration 0018 hebben ze in de kolom, nieuwe in de opslag.
 * Iedereen die beeld nodig heeft — de onderleggerroute, een moodboard, een
 * logo — leest via deze functie en niet via eigen SQL.
 */
export async function readUnderlayBytes(
  c: PoolClient,
  storage: StorageProvider,
  organizationId: string,
  assetId: string,
): Promise<{ bytes: Buffer; mime: "image/png" | "image/jpeg" } | null> {
  const row = (
    await c.query("SELECT bytes,mime,stored FROM underlay_assets WHERE id=$1", [
      assetId,
    ])
  ).rows[0] as
    | {
        bytes: Buffer | null;
        mime: "image/png" | "image/jpeg";
        stored: boolean;
      }
    | undefined;
  if (!row) return null;
  if (!row.stored) return { bytes: row.bytes!, mime: row.mime };
  const bytes = await storage.get({ organizationId, assetId });
  return { bytes: Buffer.from(bytes), mime: row.mime };
}

export class UnderlayAssetService {
  /**
   * De bytes gaan naar de opslagprovider, niet de database. Rijen van vóór
   * migration 0018 hebben hun bytes nog in de kolom staan en blijven leesbaar;
   * `stored` zegt waar ze staan.
   */
  constructor(
    private pool: Pool,
    private storage: StorageProvider,
  ) {}
  async upload(ctx: Context, id: string, bytes: Buffer) {
    if (!canWrite(ctx.role))
      throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    if (bytes.length < 24 || bytes.length > MAX_BYTES)
      throw new DomainError(
        "INVALID_IMAGE",
        "Kies een PNG- of JPEG-afbeelding van maximaal 16 MiB.",
        422,
      );
    // Metadata gaat eruit vóór er iets wordt vastgelegd. Wat de studio bewaart
    // is dus altijd het schone bestand; de GPS-coördinaten van het adres van de
    // klant komen de opslag niet in en dus ook geen export uit.
    const schoon = stripImageMetadata(bytes);
    if (MIRRORED_ORIENTATIONS.has(schoon.orientation))
      throw new DomainError(
        "INVALID_IMAGE",
        "Deze afbeelding is gespiegeld opgeslagen. Open hem, zet hem rechtop en bewaar hem opnieuw; een gespiegelde plattegrond levert verkeerde maten op.",
        422,
      );
    bytes = schoon.bytes;
    let header;
    try {
      header = readImageHeader(bytes);
    } catch (e) {
      throw new DomainError(
        "INVALID_IMAGE",
        e instanceof Error ? e.message : "Deze afbeelding is niet bruikbaar.",
        422,
      );
    }
    // De hash is die van het schone bestand: dezelfde foto twee keer geüpload,
    // de ene keer met en de andere zonder EXIF, is dezelfde onderlegger.
    const hash = createHash("sha256").update(bytes).digest("hex");
    // De draaiing zat in de metadata en gaat daarmee weg. Hij verhuist naar de
    // scène, waar de gebruiker hem ziet staan en kan bijstellen.
    const rotation = orientationRotation(schoon.orientation);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":underlay-upload",
      ]);
      const old = (
        await c.query(
          "SELECT id,source_hash,mime,width_px,height_px FROM underlay_assets WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (old) {
        if (old.source_hash !== hash)
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Deze onderlegger-ID is al voor een ander bestand gebruikt.",
            409,
          );
        return {
          id,
          mime: old.mime,
          widthPx: old.width_px,
          heightPx: old.height_px,
          rotation,
        };
      }
      const quota = (
        await c.query(
          "SELECT count(*)::int AS count, coalesce(sum(coalesce(byte_size,octet_length(bytes))),0)::bigint AS bytes FROM underlay_assets",
        )
      ).rows[0];
      if (
        quota.count >= 50 ||
        Number(quota.bytes) + bytes.length > 200 * 1024 * 1024
      )
        throw new DomainError(
          "UNDERLAY_QUOTA",
          "De onderleggeropslag is vol (50 afbeeldingen of 200 MiB per werkruimte).",
          409,
        );
      // Eerst wegschrijven, dan pas vastleggen: een rij die naar opslag wijst
      // zonder object erachter zou een kapotte onderlegger opleveren.
      await this.storage.put(
        { organizationId: ctx.organizationId, assetId: id },
        bytes,
      );
      try {
        await c.query(
          "INSERT INTO underlay_assets(organization_id,id,source_hash,mime,bytes,stored,byte_size,width_px,height_px,user_id) VALUES($1,$2,$3,$4,NULL,true,$5,$6,$7,$8)",
          [
            ctx.organizationId,
            id,
            hash,
            header.mime,
            bytes.length,
            header.widthPx,
            header.heightPx,
            ctx.userId,
          ],
        );
      } catch (e) {
        // Lukt het vastleggen niet, laat dan geen weesobject achter.
        await this.storage
          .delete({ organizationId: ctx.organizationId, assetId: id })
          .catch(() => {});
        throw e;
      }
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [
        ctx.organizationId,
        randomUUID(),
        ctx.userId,
        "underlay.accepted",
        id,
      ]);
      return {
        id,
        mime: header.mime,
        widthPx: header.widthPx,
        heightPx: header.heightPx,
        rotation,
      };
    });
  }
  /**
   * De beeldbank van de werkruimte. Dit is dezelfde opslag als die van de
   * onderleggers: wat je onder een tekening kunt leggen, kun je ook op een
   * moodboard zetten. De bytes blijven hier buiten; die worden per afbeelding
   * opgehaald.
   */
  /**
   * Waar een beeld nog in gebruik is, of null wanneer het nergens voorkomt.
   *
   * De verwijzingen zitten in JSONB-documenten — een onderlegger in een
   * ontwerp, een logo of moodboardbeeld in een presentatie — en niet in
   * refererende kolommen die de database zelf kan bewaken. Daarom zoekt dit
   * bewust grof: komt de ID érgens in zo'n document voor, dan is het beeld in
   * gebruik. Die ruime uitleg is de veilige kant om op te missen. Een beeld dat
   * onterecht bewaard blijft kost ruimte; een beeld dat onterecht verdwijnt
   * haalt een ingemeten plattegrond onder een tekening vandaan, of laat een
   * gepubliceerde presentatie die de klant al heeft zonder beeld achter.
   *
   * Het betekent ook dat een nieuwe plek die beelden gebruikt hier vanzelf
   * onder valt, zonder dat iemand eraan hoeft te denken.
   */
  private async usedBy(c: PoolClient, assetId: string) {
    const plekken = [
      { tabel: "design_documents", kolom: "document", wat: "een ontwerp" },
      { tabel: "presentations", kolom: "definition", wat: "een presentatie" },
      {
        tabel: "presentation_versions",
        kolom: "definition",
        wat: "een gepubliceerde presentatieversie",
      },
    ] as const;
    for (const plek of plekken) {
      const gevonden = await c.query(
        `SELECT 1 FROM ${plek.tabel} WHERE ${plek.kolom}::text LIKE '%' || $1 || '%' LIMIT 1`,
        [assetId],
      );
      if (gevonden.rowCount) return plek.wat;
    }
    return null;
  }

  /**
   * Een beeld uit de beeldbank halen.
   *
   * Zonder dit liep een werkruimte vol zonder uitweg: 50 beelden of 200 MiB en
   * geen manier om er een weg te halen. Verwijderen kan alleen als het beeld
   * nergens meer in gebruik is; anders weigert het met de plek erbij, zodat de
   * gebruiker weet waar hij moet kijken.
   *
   * De rij gaat eerst, het object daarna. Andersom zou een rij kunnen
   * achterblijven die naar niets wijst, en dat is een kapotte onderlegger. Een
   * object dat blijft liggen kost hooguit ruimte.
   */
  delete(ctx: Context, id: string) {
    requirePermission(ctx.role, "library.manage");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const rij = (
        await c.query("SELECT id FROM underlay_assets WHERE id=$1", [id])
      ).rows[0];
      if (!rij)
        throw new DomainError("NOT_FOUND", "Afbeelding niet gevonden.", 404);
      const gebruikt = await this.usedBy(c, id);
      if (gebruikt)
        throw new DomainError(
          "IMAGE_IN_USE",
          `Deze afbeelding wordt nog gebruikt in ${gebruikt}. Haal hem daar eerst weg.`,
          409,
        );
      await c.query("DELETE FROM underlay_assets WHERE id=$1", [id]);
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [
        ctx.organizationId,
        randomUUID(),
        ctx.userId,
        "underlay.deleted",
        id,
      ]);
      // Pas nu het object; mislukt dat, dan blijft er hooguit een bestand
      // liggen dat niemand meer kan opvragen.
      await this.storage
        .delete({ organizationId: ctx.organizationId, assetId: id })
        .catch(() => {});
      return { id, deleted: true };
    });
  }

  list(ctx: Context) {
    return inTenant(this.pool, ctx.organizationId, async (c) => ({
      items: (
        await c.query(
          "SELECT id,mime,width_px,height_px,created_at FROM underlay_assets ORDER BY created_at DESC LIMIT 50",
        )
      ).rows.map((r) => ({
        id: r.id as string,
        mime: r.mime as string,
        widthPx: r.width_px as number,
        heightPx: r.height_px as number,
        createdAt: r.created_at as string,
      })),
    }));
  }
  get(ctx: Context, id: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const found = await readUnderlayBytes(
        c,
        this.storage,
        ctx.organizationId,
        id,
      );
      if (!found)
        throw new DomainError("NOT_FOUND", "Onderlegger niet gevonden.", 404);
      return found;
    });
  }
}
