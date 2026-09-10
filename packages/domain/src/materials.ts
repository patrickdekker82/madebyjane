import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import { materialPublishSchema, materialDefinitionSchema, withDefaults, type QuantityRequest, type MaterialDefinition } from "../../contracts/src/materials";
import type { Scene } from "../../contracts/src/index";
import { roomQuantities } from "../../geometry/src/quantities";
import { computeQuantity } from "./quantities";
import { DomainError, canWrite } from "./index";
import type { Context } from "./projects";
export class MaterialService {
  constructor(private pool: Pool) {}
  private async project(c: PoolClient, projectId: string) {
    if (!(await c.query("SELECT 1 FROM projects WHERE id=$1", [projectId])).rowCount)
      throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
  }
  /** Ontwerpdocument van een variant binnen dit project; RLS begrenst de werkruimte. */
  private async design(c: PoolClient, projectId: string, variantId: string) {
    const r = await c.query(
      "SELECT d.document,d.revision FROM design_documents d JOIN design_variants v ON v.organization_id=d.organization_id AND v.id=d.variant_id WHERE d.variant_id=$1 AND v.project_id=$2",
      [variantId, projectId]);
    if (!r.rowCount) throw new DomainError("NOT_FOUND", "Dit ontwerp hoort niet bij dit project.", 404);
    return { scene: r.rows[0].document as Scene, revision: r.rows[0].revision as number };
  }
  /** Actuele hoeveelheden per ruimte, zodat de gebruiker een bron kan kiezen en veroudering ziet. */
  quantities(ctx: Context, projectId: string, variantId: string) {
    return inTenant(this.pool, ctx.organizationId, async c => {
      await this.project(c, projectId);
      const { scene, revision } = await this.design(c, projectId, variantId);
      return { variantId, revision, ...roomQuantities(scene) };
    });
  }
  list(ctx: Context, projectId: string) {
    return inTenant(this.pool, ctx.organizationId, async c => {
      await this.project(c, projectId);
      return { items: (await c.query(`SELECT * FROM (
        SELECT DISTINCT ON(entry_id) id,entry_id,version,definition,user_id,created_at
        FROM material_versions WHERE project_id=$1 ORDER BY entry_id,version DESC
      ) latest ORDER BY definition->>'category',definition->>'name',entry_id`, [projectId])).rows };
    });
  }
  /**
   * Herkomst van een gekozen alternatief controleren. Zonder deze controle kan
   * een client elke willekeurige herkomst claimen. Het alternatief moet in de
   * vorige versie hebben gestaan en de gekozen productgegevens moeten er exact
   * mee overeenkomen; eerst kiezen, daarna pas aanpassen.
   */
  private async verifyChosenFrom(c: PoolClient, projectId: string, entryId: string, baseVersion: number, definition: MaterialDefinition) {
    const chosenFrom = definition.chosenFrom;
    if (!chosenFrom) return;
    if (baseVersion === 0)
      throw new DomainError("UNKNOWN_ALTERNATIVE", "Een eerste versie kan nog geen alternatief hebben gekozen.", 409);
    const previous = (await c.query(
      "SELECT definition FROM material_versions WHERE project_id=$1 AND entry_id=$2 AND version=$3",
      [projectId, entryId, baseVersion])).rows[0];
    if (!previous) throw new DomainError("NOT_FOUND", "De vorige versie van deze keuze is niet gevonden.", 404);
    const source = withDefaults(previous.definition as MaterialDefinition).alternatives
      .find(a => a.id === chosenFrom.id);
    if (!source)
      throw new DomainError("UNKNOWN_ALTERNATIVE", "Dit alternatief stond niet in de vorige versie van deze keuze.", 409);
    const differs = ([
      ["name", definition.name], ["supplier", definition.supplier], ["collection", definition.collection],
      ["sku", definition.sku], ["colorCode", definition.colorCode], ["priceSource", definition.priceSource],
      ["priceDate", definition.priceDate], ["unitPrice", definition.unitPrice],
    ] as const).some(([key, value]) => source[key] !== value);
    if (differs || source.name !== chosenFrom.name)
      throw new DomainError("ALTERNATIVE_CHANGED", "Kies het alternatief eerst ongewijzigd; pas het daarna in een volgende versie aan.", 409);
  }
  private async calculate(c: PoolClient, projectId: string, request: QuantityRequest) {
    const { scene, revision } = await this.design(c, projectId, request.variantId);
    const room = roomQuantities(scene).rooms.find(r => r.id === request.roomId);
    if (!room)
      throw new DomainError("ROOM_NOT_FOUND", "Deze ruimte bestaat niet meer in het gekozen ontwerp. Kies de ruimte opnieuw.", 409);
    if (room.issues.length) throw new DomainError("ROOM_NOT_MEASURABLE", room.issues[0]!, 409);
    const computed = computeQuantity(room, request.basis, request.wastePercent, request.orderStep);
    const { id: _id, issues: _issues, ...inputs } = room;
    return { ...request, sourceRevision: revision, computedAt: new Date().toISOString(), inputs, ...computed };
  }
  publish(ctx: Context, projectId: string, input: unknown) {
    if (!canWrite(ctx.role)) throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    const value = materialPublishSchema.parse(input), hash = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async c => {
      await this.project(c, projectId);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ctx.organizationId + ":materials:" + projectId]);
      const old = (await c.query("SELECT * FROM material_versions WHERE id=$1", [value.versionId])).rows[0];
      if (old) {
        if (old.project_id !== projectId || old.input_hash !== hash || old.user_id !== ctx.userId)
          throw new DomainError("IDEMPOTENCY_MISMATCH", "Deze versie-ID is al anders gebruikt.", 409);
        return { id: old.id, version: old.version, replayed: true };
      }
      const latest = (await c.query("SELECT coalesce(max(version),0)::int AS version FROM material_versions WHERE project_id=$1 AND entry_id=$2", [projectId,value.entryId])).rows[0].version;
      if (latest !== value.baseVersion) throw new DomainError("VERSION_CONFLICT", "Dit materiaal is intussen gewijzigd. Ga terug naar de lijst en open de nieuwste versie.", 409);
      if (latest === 0) {
        const count = (await c.query("SELECT count(DISTINCT entry_id)::int AS count FROM material_versions WHERE project_id=$1", [projectId])).rows[0].count;
        if (count >= 200) throw new DomainError("MATERIAL_LIMIT", "Een project kan maximaal 200 materiaalkeuzes bevatten.", 409);
      }
      // De server berekent zelf; een client kan geen hoeveelheid als "berekend" laten doorgaan.
      const calculation = value.calculation ? await this.calculate(c, projectId, value.calculation) : null;
      const definition = materialDefinitionSchema.parse(calculation
        ? { ...value.definition, unit: calculation.unit, quantity: value.definition.quantity ?? calculation.orderQuantity, calculation }
        : { ...value.definition, calculation: null });
      await this.verifyChosenFrom(c, projectId, value.entryId, value.baseVersion, definition);
      const version = latest + 1;
      await c.query("INSERT INTO material_versions(organization_id,project_id,entry_id,id,version,definition,user_id,input_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [ctx.organizationId,projectId,value.entryId,value.versionId,version,definition,ctx.userId,hash]);
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [ctx.organizationId,randomUUID(),ctx.userId,"material.version_saved",value.versionId]);
      return { id: value.versionId, version, replayed: false };
    });
  }
}
