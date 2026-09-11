import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { inTenant } from "../../db/src/index";
import { id, type Scene } from "../../contracts/src/index";
import {
  presentationSchema,
  presentationTemplateVersion,
  templateSchema,
  type Presentation,
  type PresentationContent,
} from "../../contracts/src/presentations";
import type { QuoteRecord } from "../../contracts/src/quotes";
import { presentationHtml } from "../../documents/src/presentation";
import { renderQuotePdf } from "../../documents/src/quote-pdf";
import { DomainError, canWrite } from "./index";
import { readUnderlayBytes } from "./underlay-assets";
import {
  documentBytes,
  storeDocument,
  discardDocument,
} from "./document-storage";
import type { StorageProvider } from "../../storage/src/index";
import type { Context } from "./projects";
import {
  defaultPresentation,
  presentationHash,
  resolveContent,
  type ResolveInput,
} from "./presentation";
import { digest } from "./quote-resources";

const write = (ctx: Context) => {
  if (!canWrite(ctx.role))
    throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
};

/**
 * Presentaties bewaren, publiceren en delen.
 *
 * Een presentatie heeft één bewerkbaar concept en daarnaast een reeks
 * gepubliceerde versies die nooit meer veranderen. Publiceren haalt de inhoud
 * op uit het ontwerp zoals het op dat moment is, bevriest die bij de versie en
 * legt een inhoudshash vast. Een deellink wijst altijd naar één versie; het
 * ontwerp mag daarna veranderen zonder dat de klant iets anders te zien krijgt.
 */
export class PresentationService {
  constructor(
    private pool: Pool,
    private secret: string,
    private storage: StorageProvider,
    private render = renderQuotePdf,
  ) {}

  private async project(c: PoolClient, projectId: string) {
    if (
      !(await c.query("SELECT 1 FROM projects WHERE id=$1", [projectId]))
        .rowCount
    )
      throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
  }

  list(ctx: Context, projectId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, projectId);
      return {
        items: (
          await c.query(
            `SELECT p.id,p.definition->>'title' AS title,p.definition->>'template' AS template,
                    p.published_version,p.updated_at,
                    (SELECT max(version) FROM presentation_versions v
                       WHERE v.presentation_id=p.id) AS latest_version
             FROM presentations p WHERE p.project_id=$1
             ORDER BY p.updated_at DESC LIMIT 100`,
            [projectId],
          )
        ).rows,
      };
    });
  }

  create(ctx: Context, projectId: string, input: unknown) {
    write(ctx);
    const value = z
      .object({
        id,
        template: templateSchema,
        title: z.string().trim().min(1).max(160),
        customer: z.string().trim().max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        variantId: id,
        companyName: z.string().trim().min(1).max(120),
      })
      .strict()
      .parse(input);
    const definition = presentationSchema.parse(
      defaultPresentation(value.template, value),
    );
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, projectId);
      if (
        (await c.query("SELECT count(*)::int n FROM presentations")).rows[0]
          .n >= 500
      )
        throw new DomainError(
          "PRESENTATION_LIMIT",
          "Maximaal 500 presentaties per werkruimte.",
          409,
        );
      await c.query(
        "INSERT INTO presentations(organization_id,project_id,id,definition,user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [ctx.organizationId, projectId, value.id, definition, ctx.userId],
      );
      return this.read(c, value.id);
    });
  }

  private async read(c: PoolClient, presentationId: string) {
    const row = (
      await c.query("SELECT * FROM presentations WHERE id=$1", [presentationId])
    ).rows[0];
    if (!row)
      throw new DomainError("NOT_FOUND", "Presentatie niet gevonden.", 404);
    return row as {
      id: string;
      project_id: string;
      definition: Presentation;
      published_version: number | null;
      updated_at: string;
    };
  }

  get(ctx: Context, presentationId: string) {
    return inTenant(this.pool, ctx.organizationId, (c) =>
      this.read(c, presentationId),
    );
  }

  /** Het concept bijwerken. Gepubliceerde versies raakt dit nooit. */
  save(ctx: Context, presentationId: string, input: unknown) {
    write(ctx);
    const definition = presentationSchema.parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.read(c, presentationId);
      await c.query(
        "UPDATE presentations SET definition=$1,updated_at=now() WHERE id=$2",
        [definition, presentationId],
      );
      return this.read(c, presentationId);
    });
  }

  versions(ctx: Context, presentationId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.read(c, presentationId);
      return {
        items: (
          await c.query(
            "SELECT version,content_hash,template_version,created_at FROM presentation_versions WHERE presentation_id=$1 ORDER BY version DESC LIMIT 100",
            [presentationId],
          )
        ).rows,
      };
    });
  }

  version(ctx: Context, presentationId: string, version: number) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM presentation_versions WHERE presentation_id=$1 AND version=$2",
          [presentationId, version],
        )
      ).rows[0];
      if (!row)
        throw new DomainError("NOT_FOUND", "Versie niet gevonden.", 404);
      return row as {
        version: number;
        definition: Presentation;
        content: PresentationContent;
        content_hash: string;
        template_version: string;
      };
    });
  }

  /**
   * Alles ophalen waar de blokken naar verwijzen. Wat er niet is wordt niet
   * verzonnen: het blok blijft dan leeg en het document meldt dat.
   */
  private async gather(
    c: PoolClient,
    organizationId: string,
    projectId: string,
    definition: Presentation,
  ): Promise<ResolveInput> {
    const scenes: Record<string, Scene> = {};
    const images: Record<string, string> = {};
    const quotes: Record<string, QuoteRecord> = {};
    for (const block of definition.blocks) {
      if ("variantId" in block && !scenes[block.variantId]) {
        const row = (
          await c.query(
            "SELECT document FROM design_documents WHERE variant_id=$1",
            [block.variantId],
          )
        ).rows[0];
        if (row) scenes[block.variantId] = row.document as Scene;
      }
      if (block.type === "moodboard")
        for (const image of block.images)
          if (!images[image.assetId]) {
            const found = await readUnderlayBytes(
              c,
              this.storage,
              organizationId,
              image.assetId,
            );
            if (found)
              images[image.assetId] =
                `data:${found.mime};base64,${found.bytes.toString("base64")}`;
          }
      if (block.type === "price" && !quotes[block.quoteId]) {
        // De nieuwste versie van die offerte; een concept heeft geen nummer.
        const row = (
          await c.query(
            "SELECT id,version,number,definition,totals,created_at FROM quote_versions WHERE id=$1 ORDER BY version DESC LIMIT 1",
            [block.quoteId],
          )
        ).rows[0];
        if (row) quotes[block.quoteId] = row as QuoteRecord;
      }
    }
    let logo: string | null = null;
    if (definition.branding.logoAssetId) {
      const found = await readUnderlayBytes(
        c,
        this.storage,
        organizationId,
        definition.branding.logoAssetId,
      );
      if (found)
        logo = `data:${found.mime};base64,${found.bytes.toString("base64")}`;
    }
    const materials = (
      await c.query(
        `SELECT entry_id,version,definition FROM (
           SELECT DISTINCT ON(entry_id) entry_id,version,definition
           FROM material_versions WHERE project_id=$1
           ORDER BY entry_id,version DESC) latest
         ORDER BY definition->>'room',definition->>'name'`,
        [projectId],
      )
    ).rows;
    return {
      scenes,
      images,
      quotes,
      logo,
      materials: materials.map((m) => ({
        entryId: m.entry_id,
        version: m.version,
        definition: m.definition,
      })),
      date: definition.date,
    };
  }

  /**
   * Publiceren. De inhoud wordt nu vastgelegd en verandert daarna nooit meer.
   * Twee keer publiceren met hetzelfde verzoek-ID levert dezelfde versie op;
   * dat voorkomt een dubbele publicatie na een mislukte poging.
   */
  publish(ctx: Context, presentationId: string, input: unknown) {
    write(ctx);
    const value = z.object({ requestId: id }).strict().parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const row = await this.read(c, presentationId);
      const definition = presentationSchema.parse(row.definition);
      const content = resolveContent(
        definition,
        await this.gather(c, ctx.organizationId, row.project_id, definition),
      );
      const contentHash = presentationHash(definition, content);
      const inputHash = digest({ presentationId, ...value });
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":presentations",
      ]);
      const existing = (
        await c.query(
          "SELECT * FROM presentation_versions WHERE request_id=$1",
          [value.requestId],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.input_hash !== inputHash ||
          existing.user_id !== ctx.userId
        )
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Dit publicatieverzoek is al anders gebruikt.",
            409,
          );
        return { version: existing.version as number, replayed: true };
      }
      const version =
        ((
          await c.query(
            "SELECT coalesce(max(version),0)::int v FROM presentation_versions WHERE presentation_id=$1",
            [presentationId],
          )
        ).rows[0].v as number) + 1;
      await c.query(
        "INSERT INTO presentation_versions(organization_id,presentation_id,version,request_id,input_hash,definition,content,content_hash,template_version,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          ctx.organizationId,
          presentationId,
          version,
          value.requestId,
          inputHash,
          definition,
          content,
          contentHash,
          presentationTemplateVersion,
          ctx.userId,
        ],
      );
      await c.query(
        "UPDATE presentations SET published_version=$1,updated_at=now() WHERE id=$2",
        [version, presentationId],
      );
      return { version, replayed: false };
    });
  }

  /**
   * Staat er nieuw ontwerpwerk klaar dat nog niet gepubliceerd is? Dat wordt
   * bepaald door de bronrevisies van de laatste publicatie te vergelijken met
   * de revisies die er nu zijn; het concept zelf blijft ongemoeid.
   */
  outdated(ctx: Context, presentationId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const row = await this.read(c, presentationId);
      if (!row.published_version) return { changed: [], published: null };
      const published = (
        await c.query(
          "SELECT version,content FROM presentation_versions WHERE presentation_id=$1 AND version=$2",
          [presentationId, row.published_version],
        )
      ).rows[0];
      const sources = (published.content as PresentationContent).sources.filter(
        (s) => s.kind === "variant",
      );
      const changed: { id: string; was: number; now: number }[] = [];
      for (const source of sources) {
        const current = (
          await c.query(
            "SELECT (document->>'revision')::int AS revision FROM design_documents WHERE variant_id=$1",
            [source.id],
          )
        ).rows[0];
        if (current && current.revision !== source.revision)
          changed.push({
            id: source.id,
            was: source.revision,
            now: current.revision,
          });
      }
      return { changed, published: row.published_version };
    });
  }

  /** De PDF van een versie. Eenmaal gemaakt blijft hij zoals hij is. */
  async pdf(ctx: Context, presentationId: string, version: number) {
    const stored = await inTenant(
      this.pool,
      ctx.organizationId,
      async (c) =>
        (
          await c.query(
            "SELECT pdf,pdf_hash,stored,asset_id FROM presentation_exports WHERE presentation_id=$1 AND version=$2",
            [presentationId, version],
          )
        ).rows[0],
    );
    if (stored)
      return {
        pdf: await documentBytes(
          this.storage,
          ctx.organizationId,
          stored,
          stored.pdf,
        ),
        pdf_hash: stored.pdf_hash as string,
      };
    const v = await this.version(ctx, presentationId, version);
    const pdf = await this.render(presentationHtml(v.definition, v.content));
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":presentations",
      ]);
      const bewaard = await storeDocument(
        this.storage,
        ctx.organizationId,
        pdf,
      );
      try {
        await c.query(
          "INSERT INTO presentation_exports(organization_id,presentation_id,version,content_hash,pdf,pdf_hash,asset_id,stored,byte_size) VALUES($1,$2,$3,$4,NULL,$5,$6,true,$7) ON CONFLICT DO NOTHING",
          [
            ctx.organizationId,
            presentationId,
            version,
            v.content_hash,
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
          "SELECT pdf,pdf_hash,stored,asset_id FROM presentation_exports WHERE presentation_id=$1 AND version=$2",
          [presentationId, version],
        )
      ).rows[0];
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

  /** De PowerPoint van een versie; die wordt door de exportwerker gemaakt. */
  deck(ctx: Context, presentationId: string, version: number) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const row = (
        await c.query(
          "SELECT pptx,pptx_hash,stored,asset_id FROM presentation_decks WHERE presentation_id=$1 AND version=$2",
          [presentationId, version],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          "NOT_EXPORTED",
          "Deze PowerPoint is nog niet gemaakt. Vraag de export aan en probeer het zo opnieuw.",
          409,
        );
      return {
        pptx: await documentBytes(
          this.storage,
          ctx.organizationId,
          row,
          row.pptx,
        ),
        pptx_hash: row.pptx_hash as string,
      };
    });
  }

  async share(
    ctx: Context,
    presentationId: string,
    version: number,
    input: unknown,
  ) {
    write(ctx);
    const value = z
      .object({ id, days: z.number().int().min(1).max(60) })
      .strict()
      .parse(input);
    const inputHash = digest({ presentationId, version, ...value });
    // De PDF wordt vooraf gemaakt; een gedeelde link toont nooit een half bestand.
    await this.pdf(ctx, presentationId, version);
    const token = createHmac("sha256", this.secret)
      .update(
        JSON.stringify([
          ctx.organizationId,
          ctx.userId,
          presentationId,
          version,
          value.id,
        ]),
      )
      .digest("base64url");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":presentations",
      ]);
      let row = (
        await c.query("SELECT * FROM presentation_shares WHERE id=$1", [
          value.id,
        ])
      ).rows[0];
      if (row) {
        if (row.input_hash !== inputHash || row.user_id !== ctx.userId)
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Link-ID is al anders gebruikt.",
            409,
          );
      } else {
        if (
          (
            await c.query(
              "SELECT count(*)::int n FROM presentation_shares WHERE revoked_at IS NULL AND expires_at>now()",
            )
          ).rows[0].n >= 500
        )
          throw new DomainError(
            "SHARE_LIMIT",
            "Maximaal 500 actieve presentatielinks.",
            409,
          );
        row = (
          await c.query(
            "INSERT INTO presentation_shares(organization_id,id,presentation_id,version,token_hash,input_hash,user_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 day') RETURNING *",
            [
              ctx.organizationId,
              value.id,
              presentationId,
              version,
              digest(token),
              inputHash,
              ctx.userId,
              value.days,
            ],
          )
        ).rows[0];
      }
      return { id: value.id, token, expiresAt: row.expires_at as string };
    });
  }

  revoke(ctx: Context, shareId: string) {
    write(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const done = await c.query(
        "UPDATE presentation_shares SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id",
        [shareId],
      );
      if (!done.rowCount) {
        const exists = await c.query(
          "SELECT 1 FROM presentation_shares WHERE id=$1",
          [shareId],
        );
        if (!exists.rowCount)
          throw new DomainError("NOT_FOUND", "Link niet gevonden.", 404);
      }
      return { revoked: true };
    });
  }

  shares(ctx: Context, presentationId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.read(c, presentationId);
      return {
        items: (
          await c.query(
            "SELECT id,version,expires_at,revoked_at,created_at FROM presentation_shares WHERE presentation_id=$1 ORDER BY created_at DESC LIMIT 100",
            [presentationId],
          )
        ).rows,
      };
    });
  }

  /**
   * Een gedeelde link openen. De werkruimte staat in het pad en het token is
   * het geheim, zodat de rijbeveiliging van de database gewoon blijft gelden.
   * Er komt altijd precies een gepubliceerde versie uit; het ontwerp mag daarna
   * veranderen zonder dat de klant iets anders te zien krijgt.
   */
  /**
   * Dezelfde link, maar dan om in de browser te lezen. De controle is
   * identiek aan die van de PDF: een ingetrokken of verlopen link geeft niets,
   * en er komt altijd precies de gepubliceerde versie uit waar de link naar
   * wijst. Het scherm toont de tekening geschaald; de PDF blijft de maatvaste
   * uitgave.
   */
  publicView(organization: string, token: string) {
    return inTenant(this.pool, organization, async (c) => {
      const row = (
        await c.query(
          `SELECT v.definition,v.content,v.version
             FROM presentation_shares s
             JOIN presentation_versions v
               ON v.organization_id=s.organization_id
              AND v.presentation_id=s.presentation_id
              AND v.version=s.version
            WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
          [digest(token)],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          "NOT_FOUND",
          "Deze link is niet beschikbaar of verlopen.",
          404,
        );
      return row as {
        definition: Presentation;
        content: PresentationContent;
        version: number;
      };
    });
  }

  publicPdf(organization: string, token: string) {
    return inTenant(this.pool, organization, async (c) => {
      const row = (
        await c.query(
          `SELECT e.pdf,e.pdf_hash,e.stored,e.asset_id,s.version
             FROM presentation_shares s
             JOIN presentation_exports e
               ON e.organization_id=s.organization_id
              AND e.presentation_id=s.presentation_id
              AND e.version=s.version
            WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
          [digest(token)],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          "NOT_FOUND",
          "Deze link is niet beschikbaar of verlopen.",
          404,
        );
      return {
        pdf: await documentBytes(this.storage, organization, row, row.pdf),
        pdf_hash: row.pdf_hash as string,
        version: row.version as number,
      };
    });
  }
}
