import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import {
  projectInput,
  variantCopyInput,
  commandSchema,
  type Scene,
} from "../../contracts/src/index";
import { emptyScene, demoScene } from "../../test-fixtures/src/index";
import {
  DomainError,
  applyOperations,
  contentOf,
  canWrite,
  type Role,
} from "./index";
export type Context = { userId: string; organizationId: string; role: Role };
export class ProjectService {
  constructor(private pool: Pool) {}
  private write(ctx: Context) {
    if (!canWrite(ctx.role))
      throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
  }
  private async audit(
    c: PoolClient,
    ctx: Context,
    action: string,
    subject: string,
  ) {
    await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [
      ctx.organizationId,
      randomUUID(),
      ctx.userId,
      action,
      subject,
    ]);
  }
  list(ctx: Context, offset = 0) {
    return inTenant(
      this.pool,
      ctx.organizationId,
      async (c) =>
        (
          await c.query(
            "SELECT p.*,v.id AS variant_id FROM projects p JOIN LATERAL (SELECT id FROM design_variants WHERE organization_id=p.organization_id AND project_id=p.id ORDER BY EXISTS (SELECT 1 FROM variant_copies cp WHERE cp.organization_id=p.organization_id AND cp.variant_id=design_variants.id),name,id LIMIT 1) v ON true ORDER BY p.updated_at DESC,p.id LIMIT 50 OFFSET $1",
            [offset],
          )
        ).rows,
    );
  }
  create(ctx: Context, input: unknown) {
    this.write(ctx);
    const p = projectInput.parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const projectId = randomUUID(),
        variantId = randomUUID(),
        floorId = randomUUID();
      const scene = (p.demo ? demoScene : emptyScene)(
        ctx.organizationId,
        projectId,
        variantId,
        floorId,
      );
      await c.query(
        "INSERT INTO projects(organization_id,id,name,customer,description) VALUES($1,$2,$3,$4,$5)",
        [ctx.organizationId, projectId, p.name, p.customer, p.description],
      );
      await c.query(
        "INSERT INTO design_variants VALUES($1,$2,$3,'Basisontwerp')",
        [ctx.organizationId, variantId, projectId],
      );
      await c.query("INSERT INTO design_documents VALUES($1,$2,$3,0,$4)", [
        ctx.organizationId,
        variantId,
        floorId,
        scene,
      ]);
      await this.audit(c, ctx, "project.created", projectId);
      return { id: projectId, variantId, scene };
    });
  }
  variants(ctx: Context, sourceId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const source = await c.query(
        "SELECT project_id FROM design_variants WHERE id=$1",
        [sourceId],
      );
      if (!source.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      return (
        await c.query(
          "SELECT v.id,v.name,d.revision FROM design_variants v JOIN design_documents d ON d.organization_id=v.organization_id AND d.variant_id=v.id WHERE v.project_id=$1 ORDER BY v.name,v.id",
          [source.rows[0].project_id],
        )
      ).rows;
    });
  }
  copyVariant(ctx: Context, sourceId: string, input: unknown) {
    this.write(ctx);
    const copy = variantCopyInput.parse(input);
    const hash = createHash("sha256")
      .update(JSON.stringify({ sourceId, ...copy }))
      .digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":" + copy.variantId,
      ]);
      const old = await c.query(
        "SELECT input_hash,user_id FROM variant_copies WHERE variant_id=$1",
        [copy.variantId],
      );
      if (old.rowCount) {
        if (
          old.rows[0].input_hash !== hash ||
          old.rows[0].user_id !== ctx.userId
        )
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Deze variant-ID is al anders gebruikt.",
            409,
          );
        return { variantId: copy.variantId, replayed: true };
      }
      const source = await c.query(
        "SELECT document FROM design_documents WHERE variant_id=$1 FOR SHARE",
        [sourceId],
      );
      if (!source.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      const before = source.rows[0].document as Scene;
      if (before.revision !== copy.baseRevision)
        throw new DomainError(
          "REVISION_CONFLICT",
          "Het bronontwerp is gewijzigd. Herlaad voordat je een variant maakt.",
          409,
        );
      await c.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [
        before.projectId,
      ]);
      const count = await c.query(
        "SELECT count(*) FROM design_variants WHERE project_id=$1",
        [before.projectId],
      );
      if (Number(count.rows[0].count) >= 100)
        throw new DomainError(
          "VARIANT_LIMIT",
          "Dit project heeft al 100 varianten.",
          409,
        );
      const ids = new Map(
        [
          ...before.nodes,
          ...before.walls,
          ...before.openings,
          ...before.items,
        ].map((o) => [o.id, randomUUID()]),
      );
      const scene: Scene = {
        ...structuredClone(before),
        designVariantId: copy.variantId,
        floorId: randomUUID(),
        revision: 0,
        nodes: before.nodes.map((n) => ({ ...n, id: ids.get(n.id)! })),
        walls: before.walls.map((w) => ({
          ...w,
          id: ids.get(w.id)!,
          startId: ids.get(w.startId)!,
          endId: ids.get(w.endId)!,
        })),
        openings: before.openings.map((o) => ({
          ...o,
          id: ids.get(o.id)!,
          wallId: ids.get(o.wallId)!,
        })),
        items: before.items.map((i) => ({ ...i, id: ids.get(i.id)! })),
      };
      await c.query("INSERT INTO design_variants VALUES($1,$2,$3,$4)", [
        ctx.organizationId,
        copy.variantId,
        before.projectId,
        copy.name,
      ]);
      await c.query("INSERT INTO design_documents VALUES($1,$2,$3,0,$4)", [
        ctx.organizationId,
        copy.variantId,
        scene.floorId,
        scene,
      ]);
      await c.query("INSERT INTO variant_copies VALUES($1,$2,$3,$4,$5)", [
        ctx.organizationId,
        copy.variantId,
        sourceId,
        ctx.userId,
        hash,
      ]);
      await this.audit(c, ctx, "design.variant_copied", copy.variantId);
      return { variantId: copy.variantId, replayed: false };
    });
  }
  document(ctx: Context, variantId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const r = await c.query(
        "SELECT document FROM design_documents WHERE variant_id=$1",
        [variantId],
      );
      if (!r.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      return r.rows[0].document as Scene;
    });
  }
  lease(ctx: Context, variantId: string, leaseId: string) {
    this.write(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const d = await c.query(
        "SELECT variant_id FROM design_documents WHERE variant_id=$1 FOR UPDATE",
        [variantId],
      );
      if (!d.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      const l = await c.query(
        "SELECT * FROM editing_leases WHERE variant_id=$1",
        [variantId],
      );
      const old = l.rows[0];
      if (
        old &&
        new Date(old.expires_at).getTime() > Date.now() &&
        (old.lease_id !== leaseId || old.user_id !== ctx.userId)
      )
        throw new DomainError(
          "LEASE_BUSY",
          "Dit ontwerp wordt in een ander venster bewerkt.",
          423,
        );
      const r = await c.query(
        "INSERT INTO editing_leases VALUES($1,$2,$3,$4,now()+interval '45 seconds') ON CONFLICT(organization_id,variant_id) DO UPDATE SET lease_id=$3,user_id=$4,expires_at=now()+interval '45 seconds' RETURNING expires_at",
        [ctx.organizationId, variantId, leaseId, ctx.userId],
      );
      return { leaseId, expiresAt: r.rows[0].expires_at };
    });
  }
  command(ctx: Context, variantId: string, input: unknown) {
    this.write(ctx);
    const cmd = commandSchema.parse(input);
    const hash = createHash("sha256").update(JSON.stringify(cmd)).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const r = await c.query(
        "SELECT document FROM design_documents WHERE variant_id=$1 FOR UPDATE",
        [variantId],
      );
      if (!r.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      const old = await c.query(
        "SELECT * FROM command_receipts WHERE variant_id=$1 AND command_id=$2",
        [variantId, cmd.commandId],
      );
      if (old.rowCount) {
        if (
          old.rows[0].input_hash !== hash ||
          old.rows[0].user_id !== ctx.userId
        )
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Deze opdracht-ID is al anders gebruikt.",
            409,
          );
        return { scene: r.rows[0].document as Scene, replayed: true };
      }
      const l = await c.query(
        "SELECT 1 FROM editing_leases WHERE variant_id=$1 AND lease_id=$2 AND user_id=$3 AND expires_at>now()",
        [variantId, cmd.leaseId, ctx.userId],
      );
      if (!l.rowCount)
        throw new DomainError(
          "LEASE_EXPIRED",
          "Bewerktoegang verlopen. Vernieuw de toegang.",
          423,
        );
      const before = r.rows[0].document as Scene;
      if (before.revision !== cmd.baseRevision)
        throw new DomainError(
          "REVISION_CONFLICT",
          `Nieuwere versie beschikbaar: ${before.revision}. Je lokale werk blijft behouden.`,
          409,
        );
      let operations = cmd.operations;
      const resolved: typeof operations = [];
      for (const op of operations) {
        if (op.type !== "PlaceLibraryItem") {
          resolved.push(op);
          continue;
        }
        const row = await c.query(
          "SELECT id,entry_id,version,definition FROM library_versions WHERE id=$1",
          [op.versionId],
        );
        if (!row.rowCount)
          throw new DomainError(
            "NOT_FOUND",
            "Bibliotheekversie niet gevonden.",
            404,
          );
        const v = row.rows[0];
        resolved.push({
          type: "PlaceItem",
          item: {
            ...v.definition,
            id: op.id,
            x: op.x,
            y: op.y,
            rotation: op.rotation,
            custom: false,
            libraryRef: {
              entryId: v.entry_id,
              versionId: v.id,
              version: v.version,
            },
          },
        });
      }
      operations = resolved;
      const restore = operations.find((op) => op.type === "RestoreRevision");
      if (restore?.type === "RestoreRevision") {
        if (operations.length !== 1)
          throw new DomainError(
            "INVALID_RESTORE",
            "Herstel moet een afzonderlijke opdracht zijn.",
          );
        const target = await c.query(
          "SELECT document FROM design_revisions WHERE variant_id=$1 AND id=$2",
          [variantId, restore.revisionId],
        );
        if (!target.rowCount)
          throw new DomainError("NOT_FOUND", "Revisie niet gevonden.", 404);
        operations = [
          {
            type: "RestoreContent",
            content: contentOf(target.rows[0].document as Scene),
          },
        ];
        await c.query(
          "INSERT INTO design_revisions(organization_id,variant_id,id,name,revision,document) VALUES($1,$2,$3,$4,$5,$6)",
          [
            ctx.organizationId,
            variantId,
            randomUUID(),
            "Voor herstel · revisie " + before.revision,
            before.revision,
            before,
          ],
        );
        await this.audit(c, ctx, "design.restore", restore.revisionId);
      }
      let next: Scene;
      try {
        next = applyOperations(before, operations);
      } catch (e) {
        throw new DomainError(
          "INVALID_GEOMETRY",
          e instanceof Error ? e.message : "Ongeldige geometrie.",
        );
      }
      const linked = next.items.filter((item) => item.libraryRef);
      if (linked.length) {
        const versions = await c.query(
          "SELECT id,entry_id,version,definition FROM library_versions WHERE id=ANY($1::uuid[])",
          [[...new Set(linked.map((item) => item.libraryRef!.versionId))]],
        );
        const byId = new Map(versions.rows.map((v) => [v.id, v]));
        for (const item of linked) {
          const ref = item.libraryRef!,
            v = byId.get(ref.versionId);
          if (!v || v.entry_id !== ref.entryId || v.version !== ref.version)
            throw new DomainError(
              "INVALID_LIBRARY_REFERENCE",
              "Bibliotheekverwijzing is ongeldig voor deze organisatie.",
            );
          if (
            !item.custom &&
            (item.width !== v.definition.width ||
              item.depth !== v.definition.depth ||
              item.height !== v.definition.height)
          )
            throw new DomainError(
              "CUSTOM_SIZE_REQUIRED",
              "Kies maatwerk om van de bibliotheekmaten af te wijken.",
            );
        }
      }
      const modelItems = next.items.filter(item => item.model);
      if (modelItems.length) {
        const assets = (await c.query("SELECT id,width,depth,height FROM model_assets WHERE id=ANY($1::uuid[])", [[...new Set(modelItems.map(item => item.model!.assetId))]])).rows;
        for (const item of modelItems) {
          const ref = item.model!, asset = assets.find(a => a.id === ref.assetId);
          if (!asset || asset.width !== ref.width || asset.depth !== ref.depth || asset.height !== ref.height)
            throw new DomainError("INVALID_MODEL_REFERENCE", "Modelverwijzing is ongeldig voor deze werkruimte.");
        }
      }
      await c.query(
        "UPDATE design_documents SET document=$2,revision=$3 WHERE variant_id=$1",
        [variantId, next, next.revision],
      );
      await c.query(
        "INSERT INTO command_receipts(organization_id,variant_id,command_id,user_id,input_hash,revision) VALUES($1,$2,$3,$4,$5,$6)",
        [
          ctx.organizationId,
          variantId,
          cmd.commandId,
          ctx.userId,
          hash,
          next.revision,
        ],
      );
      await c.query("UPDATE projects SET updated_at=now() WHERE id=$1", [
        next.projectId,
      ]);
      await this.audit(c, ctx, "design.command", variantId);
      return { scene: next, replayed: false };
    });
  }
  revisions(ctx: Context, variantId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const exists = await c.query(
        "SELECT 1 FROM design_documents WHERE variant_id=$1",
        [variantId],
      );
      if (!exists.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      const result = await c.query(
        "SELECT id,name,revision,created_at FROM design_revisions WHERE variant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
        [variantId],
      );
      return result.rows;
    });
  }
  revision(ctx: Context, variantId: string, name: string) {
    this.write(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const r = await c.query(
        "SELECT document,revision FROM design_documents WHERE variant_id=$1 FOR SHARE",
        [variantId],
      );
      if (!r.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      const revisionId = randomUUID();
      await c.query(
        "INSERT INTO design_revisions(organization_id,variant_id,id,name,revision,document) VALUES($1,$2,$3,$4,$5,$6)",
        [
          ctx.organizationId,
          variantId,
          revisionId,
          name,
          r.rows[0].revision,
          r.rows[0].document,
        ],
      );
      await this.audit(c, ctx, "design.revision", revisionId);
      return { id: revisionId, revision: r.rows[0].revision };
    });
  }
}
