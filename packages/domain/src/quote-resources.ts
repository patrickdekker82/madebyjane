import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { inTenant } from "../../db/src/index";
import {
  attachmentInput,
  priceInput,
  type QuoteDefinition,
  type QuoteRecord,
  type AttachmentSnapshot,
} from "../../contracts/src/quotes";
import { planSvg, escapeXml as esc } from "../../documents/src/plan";
import { sceneSchema } from "../../contracts/src/index";
import { DomainError, requirePermission } from "./index";
import type { Context } from "./projects";
export const digest = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export const quoteContentHash = (q: QuoteRecord) =>
  q.content_hash ??
  digest({
    number: q.number,
    definition: q.definition,
    totals: q.totals,
    frozen: q.frozen,
  });
/** Offertetoegang loopt via de rechtenmatrix, niet via een rollijst. */
export const requireFinance = (ctx: Context) =>
  requirePermission(ctx.role, "quote.read");
export async function checkProject(c: PoolClient, project: string) {
  if (
    !(await c.query("SELECT 1 FROM projects WHERE id=$1", [project])).rowCount
  )
    throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
}
export class QuoteResources {
  constructor(private pool: Pool) {}
  list(ctx: Context, project: string) {
    requireFinance(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await checkProject(c, project);
      return {
        prices: (
          await c.query(
            "SELECT DISTINCT ON(entry_id) id,entry_id,version,definition FROM commercial_prices WHERE project_id=$1 ORDER BY entry_id,version DESC",
            [project],
          )
        ).rows,
        attachments: (
          await c.query(
            "SELECT id,snapshot->>'title' AS title,snapshot->>'kind' AS kind,created_at FROM quote_attachments WHERE project_id=$1 ORDER BY created_at DESC LIMIT 200",
            [project],
          )
        ).rows,
        revisions: (
          await c.query(
            "SELECT r.id,r.variant_id,r.name,r.revision,r.created_at FROM design_revisions r JOIN design_variants v ON v.id=r.variant_id AND v.organization_id=r.organization_id WHERE v.project_id=$1 ORDER BY r.created_at DESC LIMIT 100",
            [project],
          )
        ).rows,
      };
    });
  }
  design(ctx: Context, project: string, revision: string) {
    requireFinance(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await checkProject(c, project);
      const r = await designRevision(c, project, revision);
      return {
        revisionId: revision,
        variantId: r.variant_id,
        revision: r.revision,
        items: sceneSchema.parse(r.document).items,
      };
    });
  }
  price(ctx: Context, project: string, input: unknown) {
    requireFinance(ctx);
    const v = priceInput.parse(input),
      hash = digest(v);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await checkProject(c, project);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      const replay = (
        await c.query("SELECT * FROM commercial_prices WHERE id=$1", [v.id])
      ).rows[0];
      if (replay) {
        if (
          replay.project_id !== project ||
          replay.input_hash !== hash ||
          replay.user_id !== ctx.userId
        )
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Prijs-ID is al anders gebruikt.",
            409,
          );
        return replay;
      }
      const table =
        v.sourceType === "material" ? "material_versions" : "library_versions";
      const found = await c.query(
        `SELECT 1 FROM ${table} WHERE entry_id=$1 ${v.sourceType === "material" ? "AND project_id=$2" : ""} LIMIT 1`,
        v.sourceType === "material" ? [v.sourceId, project] : [v.sourceId],
      );
      if (!found.rowCount)
        throw new DomainError("INVALID_SOURCE", "Prijsbron niet gevonden.");
      const latest = (
        await c.query(
          "SELECT * FROM commercial_prices WHERE project_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 1",
          [project, v.entryId],
        )
      ).rows[0];
      if ((latest?.version ?? 0) !== v.baseVersion)
        throw new DomainError(
          "VERSION_CONFLICT",
          "Prijs is intussen gewijzigd.",
          409,
        );
      if (
        latest &&
        (latest.definition.sourceType !== v.sourceType ||
          latest.definition.sourceId !== v.sourceId)
      )
        throw new DomainError(
          "INVALID_SOURCE",
          "Een prijsreeks behoudt dezelfde productbron.",
        );
      if (
        !latest &&
        (
          await c.query(
            "SELECT count(DISTINCT entry_id)::int n FROM commercial_prices WHERE project_id=$1",
            [project],
          )
        ).rows[0].n >= 500
      )
        throw new DomainError(
          "LIMIT",
          "Maximaal 500 prijsreeksen per project.",
          409,
        );
      if (
        !latest &&
        (
          await c.query(
            "SELECT 1 FROM commercial_prices WHERE project_id=$1 AND definition->>'sourceType'=$2 AND definition->>'sourceId'=$3 LIMIT 1",
            [project, v.sourceType, v.sourceId],
          )
        ).rowCount
      )
        throw new DomainError(
          "PRICE_EXISTS",
          "Dit product heeft al een prijsreeks. Werk die reeks bij.",
          409,
        );
      return (
        await c.query(
          "INSERT INTO commercial_prices(organization_id,project_id,id,entry_id,version,definition,input_hash,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,entry_id,version,definition",
          [
            ctx.organizationId,
            project,
            v.id,
            v.entryId,
            v.baseVersion + 1,
            v,
            hash,
            ctx.userId,
          ],
        )
      ).rows[0];
    });
  }
  attachment(ctx: Context, project: string, input: unknown) {
    requireFinance(ctx);
    const v = attachmentInput.parse(input),
      hash = digest(v);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await checkProject(c, project);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      const replay = (
        await c.query("SELECT * FROM quote_attachments WHERE id=$1", [v.id])
      ).rows[0];
      if (replay) {
        if (
          replay.project_id !== project ||
          replay.input_hash !== hash ||
          replay.user_id !== ctx.userId
        )
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Bijlage-ID is al anders gebruikt.",
            409,
          );
        return replay.snapshot;
      }
      if (
        (
          await c.query(
            "SELECT count(*)::int n FROM quote_attachments WHERE project_id=$1",
            [project],
          )
        ).rows[0].n >= 200
      )
        throw new DomainError(
          "LIMIT",
          "Maximaal 200 vaste bijlagen per project.",
          409,
        );
      const snapshot: AttachmentSnapshot = {
        id: v.id,
        title: v.title,
        kind: v.kind,
        html: "",
        hash: "",
      };
      if (v.kind === "text")
        snapshot.html = `<h1>${esc(v.title)}</h1><div class="prose">${esc(v.text)}</div>`;
      if (v.kind === "plan") {
        const r = await designRevision(c, project, v.revisionId);
        snapshot.variantId = r.variant_id;
        snapshot.revisionId = v.revisionId;
        try {
          snapshot.html = planSvg(sceneSchema.parse(r.document), v.scale);
        } catch (e) {
          throw new DomainError("PLAN_DOES_NOT_FIT", (e as Error).message);
        }
      }
      if (v.kind === "materials") {
        if (new Set(v.versionIds).size !== v.versionIds.length)
          throw new DomainError("INVALID_SOURCE", "Dubbele materiaalversie.");
        const rows = (
          await c.query(
            "SELECT id,entry_id,definition FROM material_versions WHERE project_id=$1 AND id=ANY($2::uuid[])",
            [project, v.versionIds],
          )
        ).rows;
        if (
          rows.length !== v.versionIds.length ||
          new Set(rows.map((r) => r.entry_id)).size !== rows.length
        )
          throw new DomainError(
            "INVALID_SOURCE",
            "Materiaalversies ontbreken of bevatten alternatieve versies van dezelfde keuze.",
          );
        rows.sort(
          (a, b) => v.versionIds.indexOf(a.id) - v.versionIds.indexOf(b.id),
        );
        snapshot.materialVersions = rows.map((r) => ({
          entryId: r.entry_id,
          versionId: r.id,
        }));
        snapshot.html =
          `<h1>${esc(v.title)}</h1>` +
          rows
            .map((r) => {
              const d = r.definition;
              return `<article><h2>${esc(d.name)}</h2><p>${[d.room, d.supplier, d.collection, d.sku, d.colorCode].filter(Boolean).map(esc).join(" · ")}</p><p>${esc(d.quantity ?? "Onbekend")} ${esc(d.unit)} · ${esc(d.quantityReason)}</p><p class="prose">${esc(d.notes)}</p></article>`;
            })
            .join("");
      }
      snapshot.hash = digest({ ...snapshot, hash: undefined });
      await c.query(
        "INSERT INTO quote_attachments(organization_id,project_id,id,definition,snapshot,input_hash,user_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [ctx.organizationId, project, v.id, v, snapshot, hash, ctx.userId],
      );
      return snapshot;
    });
  }
}
export async function designRevision(
  c: PoolClient,
  project: string,
  id: string,
) {
  const row = (
    await c.query(
      "SELECT r.* FROM design_revisions r JOIN design_variants v ON v.organization_id=r.organization_id AND v.id=r.variant_id WHERE v.project_id=$1 AND r.id=$2",
      [project, id],
    )
  ).rows[0];
  if (!row)
    throw new DomainError(
      "INVALID_SOURCE",
      "Ontwerprevisie niet gevonden in dit project.",
    );
  return row;
}
export async function resourceCheck(
  c: PoolClient,
  project: string,
  d: QuoteDefinition,
  finalizing: boolean,
) {
  const changes: {
      lineId: string;
      name: string;
      kind: string;
      latestVersionId: string;
      previous: any;
      current: any;
    }[] = [],
    sources: unknown[] = [],
    revisions = new Map<string, string>(),
    products: { key: string; type: string; reason: string }[] = [];
  const product = (
    supplier: string | undefined,
    sku: string | undefined,
    type: string,
    reason: string | undefined,
  ) => {
    if (supplier?.trim() && sku?.trim())
      products.push({
        key: supplier.trim().toLowerCase() + ":" + sku.trim().toLowerCase(),
        type,
        reason: reason ?? "",
      });
  };
  for (const l of d.lines) {
    let sourceType = "",
      sourceId = "";
    if (l.source) {
      sourceType = "material";
      sourceId = l.source.entryId;
      const r = (
        await c.query(
          "SELECT definition FROM material_versions WHERE project_id=$1 AND entry_id=$2 AND id=$3",
          [project, sourceId, l.source.versionId],
        )
      ).rows[0];
      if (r) {
        sources.push({
          lineId: l.id,
          material: r.definition,
          source: l.source,
        });
        product(
          r.definition.supplier,
          r.definition.sku,
          "material",
          l.overlapReason,
        );
      }
    }
    if (l.designSource) {
      const r = await designRevision(c, project, l.designSource.revisionId);
      if (r.variant_id !== l.designSource.variantId)
        throw new DomainError(
          "INVALID_SOURCE",
          "Ontwerpbron verwijst naar een andere variant.",
        );
      const item = sceneSchema
        .parse(r.document)
        .items.find((i) => i.id === l.designSource!.itemId);
      if (!item)
        throw new DomainError(
          "INVALID_SOURCE",
          "Ontwerpobject ontbreekt in de bronrevisie.",
        );
      if (Number(l.quantity) !== 1)
        throw new DomainError(
          "INVALID_QUANTITY",
          "Een gekoppeld ontwerpobject telt precies eenmaal. Gebruik een handmatige post voor extra aantallen.",
        );
      if (revisions.has(r.variant_id) && revisions.get(r.variant_id) !== r.id)
        throw new DomainError(
          "INCONSISTENT_REVISIONS",
          "Gebruik één ontwerprevisie per variant in een offerte.",
        );
      revisions.set(r.variant_id, r.id);
      sources.push({ lineId: l.id, item, source: l.designSource });
      sourceType = "library";
      sourceId = item.libraryRef?.entryId ?? "";
      product(
        item.catalog?.supplier,
        item.catalog?.sku,
        "design",
        l.overlapReason,
      );
      const live = (
        await c.query(
          "SELECT revision,document FROM design_documents WHERE variant_id=$1",
          [r.variant_id],
        )
      ).rows[0];
      const current = live
        ? sceneSchema.parse(live.document).items.find((i) => i.id === item.id)
        : undefined;
      if (live && digest(current ?? null) !== digest(item))
        changes.push({
          lineId: l.id,
          name: l.description,
          kind: "design",
          latestVersionId: r.id,
          previous: { ...item, revision: r.revision },
          current: {
            ...(current ?? { name: "Object verwijderd" }),
            revision: live.revision,
          },
        });
    }
    if (l.priceRef) {
      const p = (
        await c.query(
          "SELECT * FROM commercial_prices WHERE project_id=$1 AND id=$2",
          [project, l.priceRef.id],
        )
      ).rows[0];
      if (
        !p ||
        p.definition.sourceType !== sourceType ||
        p.definition.sourceId !== sourceId
      )
        throw new DomainError(
          "INVALID_PRICE",
          "Prijsversie past niet bij de productbron.",
        );
      for (const field of [
        "unitPrice",
        "unit",
        "taxCategory",
        "taxRate",
      ] as const)
        if (l[field] !== p.definition[field])
          throw new DomainError(
            "PRICE_MISMATCH",
            "De gekoppelde prijs is gewijzigd. Neem de prijsversie over of kies expliciet een handmatige prijs.",
          );
      sources.push({
        lineId: l.id,
        price: p.definition,
        priceVersion: p.version,
      });
      const latest = (
        await c.query(
          "SELECT * FROM commercial_prices WHERE project_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 1",
          [project, p.entry_id],
        )
      ).rows[0];
      if (latest.id !== p.id)
        changes.push({
          lineId: l.id,
          name: l.description,
          kind: "price",
          latestVersionId: latest.id,
          previous: p.definition,
          current: latest.definition,
        });
    }
  }
  for (const p of products)
    if (
      products.some(
        (other) =>
          other.key === p.key &&
          other.type !== p.type &&
          !p.reason &&
          !other.reason,
      )
    )
      throw new DomainError(
        "POSSIBLE_DOUBLE_COUNT",
        "Hetzelfde leverancierartikel staat via materiaal én ontwerp in de offerte. Verwijder de dubbele post of onderbouw expliciet waarom dit verschillende leveringen zijn.",
      );
  // Calculated material quantities also belong to a specific scene revision.
  const sceneRevisions = new Map<string, number>();
  const registerScene = (variant: string, revision: number) => {
    if (sceneRevisions.has(variant) && sceneRevisions.get(variant) !== revision)
      throw new DomainError(
        "INCONSISTENT_REVISIONS",
        "Berekende materialen, ontwerpposten en bijlagen gebruiken verschillende ontwerprevisies.",
      );
    sceneRevisions.set(variant, revision);
  };
  for (const [variant, revisionId] of revisions) {
    const r = await designRevision(c, project, revisionId);
    registerScene(variant, r.revision);
  }
  const lineMaterials = (
    await c.query(
      "SELECT definition FROM material_versions WHERE project_id=$1 AND id=ANY($2::uuid[])",
      [project, d.lines.flatMap((l) => (l.source ? [l.source.versionId] : []))],
    )
  ).rows;
  for (const source of lineMaterials) {
    const calculation = source.definition.calculation;
    if (calculation)
      registerScene(calculation.variantId, calculation.sourceRevision);
  }
  const attachments: AttachmentSnapshot[] = [];
  const materialRevisions = new Map(
    d.lines
      .filter((l) => l.source)
      .map((l) => [l.source!.entryId, l.source!.versionId]),
  );
  for (const id of d.attachments ?? []) {
    const a = (
      await c.query(
        "SELECT snapshot FROM quote_attachments WHERE project_id=$1 AND id=$2",
        [project, id],
      )
    ).rows[0]?.snapshot as AttachmentSnapshot | undefined;
    if (!a)
      throw new DomainError(
        "INVALID_ATTACHMENT",
        "Bijlage niet gevonden in dit project.",
      );
    if (a.variantId && a.revisionId) {
      if (
        revisions.has(a.variantId) &&
        revisions.get(a.variantId) !== a.revisionId
      )
        throw new DomainError(
          "INCONSISTENT_REVISIONS",
          "Ontwerpposten en planbijlagen gebruiken verschillende revisies.",
        );
      revisions.set(a.variantId, a.revisionId);
      const r = await designRevision(c, project, a.revisionId);
      registerScene(a.variantId, r.revision);
    }
    for (const m of a.materialVersions ?? []) {
      if (
        materialRevisions.has(m.entryId) &&
        materialRevisions.get(m.entryId) !== m.versionId
      )
        throw new DomainError(
          "INCONSISTENT_REVISIONS",
          "Materiaalpost en bijlage gebruiken verschillende versies.",
        );
      materialRevisions.set(m.entryId, m.versionId);
      const material = (
        await c.query(
          "SELECT definition FROM material_versions WHERE project_id=$1 AND id=$2",
          [project, m.versionId],
        )
      ).rows[0];
      const calculation = material?.definition.calculation;
      if (calculation)
        registerScene(calculation.variantId, calculation.sourceRevision);
    }
    attachments.push(a);
  }
  if (finalizing && changes.some((c) => c.kind === "price"))
    throw new DomainError(
      "STALE_PRICE",
      "Catalogusprijzen zijn gewijzigd. Controleer de verschillen vóór finalisatie.",
      409,
    );
  return { changes, frozen: { attachments, sources } };
}
