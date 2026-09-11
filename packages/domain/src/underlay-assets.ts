import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import { readImageHeader } from "../../image-import/src/index";
import { DomainError, canWrite } from "./index";
import type { Context } from "./projects";

const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Onderleggerafbeeldingen. De bytes worden opgeslagen zoals ze binnenkomen; er
 * wordt op de server niets gedecodeerd, alleen de kop gelezen voor type en
 * maten. Uitleveren gebeurt met een vast, uit die kop afgeleid content-type en
 * met nosniff, zodat de browser er nooit iets anders van kan maken.
 */
export class UnderlayAssetService {
  constructor(private pool: Pool) {}
  async upload(ctx: Context, id: string, bytes: Buffer) {
    if (!canWrite(ctx.role))
      throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    if (bytes.length < 24 || bytes.length > MAX_BYTES)
      throw new DomainError(
        "INVALID_IMAGE",
        "Kies een PNG- of JPEG-afbeelding van maximaal 16 MiB.",
        422,
      );
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
    const hash = createHash("sha256").update(bytes).digest("hex");
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
        };
      }
      const quota = (
        await c.query(
          "SELECT count(*)::int AS count, coalesce(sum(octet_length(bytes)),0)::bigint AS bytes FROM underlay_assets",
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
      await c.query(
        "INSERT INTO underlay_assets(organization_id,id,source_hash,mime,bytes,width_px,height_px,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          ctx.organizationId,
          id,
          hash,
          header.mime,
          bytes,
          header.widthPx,
          header.heightPx,
          ctx.userId,
        ],
      );
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
      };
    });
  }
  /**
   * De beeldbank van de werkruimte. Dit is dezelfde opslag als die van de
   * onderleggers: wat je onder een tekening kunt leggen, kun je ook op een
   * moodboard zetten. De bytes blijven hier buiten; die worden per afbeelding
   * opgehaald.
   */
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
      const row = (
        await c.query("SELECT bytes,mime FROM underlay_assets WHERE id=$1", [
          id,
        ])
      ).rows[0];
      if (!row)
        throw new DomainError("NOT_FOUND", "Onderlegger niet gevonden.", 404);
      return row as { bytes: Buffer; mime: "image/png" | "image/jpeg" };
    });
  }
}
