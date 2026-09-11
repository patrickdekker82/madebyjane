import { createHmac, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { inTenant } from "../../db/src/index";
import { id } from "../../contracts/src/index";
import type { Context } from "./projects";
import { QuoteService } from "./quotes";
import { quoteHtml, quoteTemplateVersion } from "../../documents/src/quote";
import { renderQuotePdf } from "../../documents/src/quote-pdf";
import { requireFinance, digest, quoteContentHash } from "./quote-resources";
import { DomainError, requirePermission } from "./index";
import {
  documentBytes,
  storeDocument,
  discardDocument,
} from "./document-storage";
import type { StorageProvider } from "../../storage/src/index";
import { resolveProjectRole } from "./project-access";
export class QuoteDelivery {
  constructor(
    private pool: Pool,
    private secret: string,
    private storage: StorageProvider,
    private render = renderQuotePdf,
  ) {}
  async export(ctx: Context, project: string, quote: string, version: number) {
    requireFinance(ctx);
    const q = await new QuoteService(this.pool).get(
      ctx,
      project,
      quote,
      version,
    );
    if (!q.number)
      throw new DomainError(
        "NOT_FINAL",
        "Maak de offerte eerst definitief.",
        409,
      );
    const existing = await inTenant(
      this.pool,
      ctx.organizationId,
      async (c) =>
        (
          await c.query(
            "SELECT pdf,pdf_hash,stored,asset_id FROM quote_exports WHERE quote_id=$1 AND quote_version=$2",
            [quote, version],
          )
        ).rows[0],
    );
    if (existing)
      return {
        pdf: await documentBytes(
          this.storage,
          ctx.organizationId,
          existing,
          existing.pdf,
        ),
        pdf_hash: existing.pdf_hash as string,
      };
    const contentHash = quoteContentHash(q);
    q.content_hash = contentHash;
    const pdf = await this.render(quoteHtml(q));
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      const cached = (
        await c.query(
          "SELECT pdf,pdf_hash,stored,asset_id FROM quote_exports WHERE quote_id=$1 AND quote_version=$2",
          [quote, version],
        )
      ).rows[0];
      if (cached)
        return {
          pdf: await documentBytes(
            this.storage,
            ctx.organizationId,
            cached,
            cached.pdf,
          ),
          pdf_hash: cached.pdf_hash as string,
        };
      if (
        (await c.query("SELECT count(*)::int n FROM quote_exports")).rows[0]
          .n >= 2000
      )
        throw new DomainError(
          "EXPORT_LIMIT",
          "Maximaal 2000 bewaarde offerte-PDFs per werkruimte.",
          409,
        );
      // Eerst wegschrijven, dan vastleggen; mislukt het vastleggen, dan ruimen
      // we het object op zodat er geen weesbestand achterblijft.
      const bewaard = await storeDocument(
        this.storage,
        ctx.organizationId,
        pdf,
      );
      try {
        await c.query(
          "INSERT INTO quote_exports(organization_id,quote_id,quote_version,template_version,content_hash,pdf,pdf_hash,asset_id,stored,byte_size) VALUES($1,$2,$3,$4,$5,NULL,$6,$7,true,$8) ON CONFLICT DO NOTHING",
          [
            ctx.organizationId,
            quote,
            version,
            quoteTemplateVersion,
            contentHash,
            pdfHash,
            bewaard.assetId,
            bewaard.size,
          ],
        );
      } catch (e) {
        await discardDocument(
          this.storage,
          ctx.organizationId,
          bewaard.assetId,
        );
        throw e;
      }
      const row = (
        await c.query(
          "SELECT pdf,pdf_hash,stored,asset_id FROM quote_exports WHERE quote_id=$1 AND quote_version=$2",
          [quote, version],
        )
      ).rows[0];
      // Bij een gelijktijdige export won de andere rij; lever dan díe bytes.
      if (row.asset_id !== bewaard.assetId)
        await discardDocument(
          this.storage,
          ctx.organizationId,
          bewaard.assetId,
        );
      return {
        pdf: await documentBytes(
          this.storage,
          ctx.organizationId,
          row,
          row.pdf,
        ),
        pdf_hash: row.pdf_hash as string,
      };
    });
  }
  async share(
    ctx: Context,
    project: string,
    quote: string,
    version: number,
    input: unknown,
  ) {
    requirePermission(ctx.role, "share.publish");
    const v = z
        .object({ id, days: z.number().int().min(1).max(30) })
        .strict()
        .parse(input),
      hash = digest({ project, quote, version, ...v });
    await this.export(ctx, project, quote, version);
    const token = createHmac("sha256", this.secret)
      .update(
        JSON.stringify([ctx.organizationId, ctx.userId, quote, version, v.id]),
      )
      .digest("base64url");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      let row = (
        await c.query("SELECT * FROM quote_shares WHERE id=$1", [v.id])
      ).rows[0];
      if (row) {
        if (row.input_hash !== hash || row.user_id !== ctx.userId)
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Link-ID is al anders gebruikt.",
            409,
          );
      } else {
        if (
          (
            await c.query(
              "SELECT count(*)::int n FROM quote_shares WHERE revoked_at IS NULL AND expires_at>now()",
            )
          ).rows[0].n >= 500
        )
          throw new DomainError(
            "SHARE_LIMIT",
            "Maximaal 500 actieve offertelinks.",
            409,
          );
        row = (
          await c.query(
            "INSERT INTO quote_shares(organization_id,id,quote_id,quote_version,token_hash,input_hash,user_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 day') RETURNING *",
            [
              ctx.organizationId,
              v.id,
              quote,
              version,
              digest(token),
              hash,
              ctx.userId,
              v.days,
            ],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO audit_events(organization_id,id,user_id,action,subject_id,detail) VALUES($1,$2,$3,'quote.share_created',$4,$5)",
          [ctx.organizationId, randomUUID(), ctx.userId, v.id, { version }],
        );
      }
      return {
        id: row.id,
        expiresAt: row.expires_at,
        revoked: !!row.revoked_at,
        path: `/api/v1/quote-shares/${ctx.organizationId}/${token}`,
      };
    });
  }
  async shares(ctx: Context, project: string, quote: string, version: number) {
    requireFinance(ctx);
    await new QuoteService(this.pool).get(ctx, project, quote, version);
    return inTenant(this.pool, ctx.organizationId, async (c) => ({
      items: (
        await c.query(
          "SELECT id,expires_at,revoked_at,created_at FROM quote_shares WHERE quote_id=$1 AND quote_version=$2 ORDER BY created_at DESC LIMIT 100",
          [quote, version],
        )
      ).rows,
    }));
  }
  revoke(ctx: Context, grant: string) {
    requirePermission(ctx.role, "share.revoke");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      // De link wijst een project aan; ook hier geldt de projecttoegang, anders
      // zou een beperkt project via zijn deellink alsnog bereikbaar zijn.
      const owner = (
        await c.query(
          "SELECT DISTINCT v.project_id FROM quote_shares s JOIN quote_versions v ON v.organization_id=s.organization_id AND v.id=s.quote_id WHERE s.id=$1",
          [grant],
        )
      ).rows[0];
      if (owner) await resolveProjectRole(c, ctx, owner.project_id);
      const r = await c.query(
        "UPDATE quote_shares SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id,quote_version",
        [grant],
      );
      if (r.rowCount) {
        await c.query(
          "INSERT INTO audit_events(organization_id,id,user_id,action,subject_id,detail) VALUES($1,$2,$3,'quote.share_revoked',$4,$5)",
          [
            ctx.organizationId,
            randomUUID(),
            ctx.userId,
            grant,
            { version: r.rows[0].quote_version },
          ],
        );
      } else if (
        !(await c.query("SELECT id FROM quote_shares WHERE id=$1", [grant]))
          .rowCount
      )
        throw new DomainError("NOT_FOUND", "Link niet gevonden.", 404);
      return { id: grant, revoked: true };
    });
  }
  publicPdf(organization: string, token: string) {
    return inTenant(this.pool, organization, async (c) => {
      const r = (
        await c.query(
          "SELECT e.pdf,e.pdf_hash,e.stored,e.asset_id FROM quote_shares s JOIN quote_exports e ON e.organization_id=s.organization_id AND e.quote_id=s.quote_id AND e.quote_version=s.quote_version WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()",
          [digest(token)],
        )
      ).rows[0];
      if (!r)
        throw new DomainError(
          "NOT_FOUND",
          "Deze link is niet beschikbaar of verlopen.",
          404,
        );
      return {
        pdf: await documentBytes(this.storage, organization, r, r.pdf),
        pdf_hash: r.pdf_hash as string,
      };
    });
  }
}
