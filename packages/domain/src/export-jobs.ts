import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { inTenant } from "../../db/src/index";
import { id } from "../../contracts/src/index";
import { DomainError } from "./index";
import type { Context } from "./projects";

/**
 * Exporttaken voor presentaties.
 *
 * Een taak verwijst naar een gepubliceerde versie, niet naar een bestand.
 * Dezelfde versie in hetzelfde formaat is altijd dezelfde taak; twee keer
 * vragen levert dus geen twee exports en geen tweede publicatie op. De taak
 * bewaart de invoerrevisie, het aantal pogingen en de hash van het resultaat.
 *
 * Herstartbaar: een taak die halverwege afbrak blijft op `running` staan met
 * zijn starttijd. Een taak die te lang loopt wordt weer vrijgegeven, met een
 * poging erbij. Boven het maximum stopt het en blijft de fout staan, in plaats
 * van eindeloos opnieuw te proberen.
 *
 * Een half bestand is nooit te downloaden: het resultaat wordt in dezelfde
 * transactie weggeschreven als de statuswissel naar `done`.
 */
export const MAX_ATTEMPTS = 3;
/** Loopt een taak langer dan dit, dan is het proces vermoedelijk weggevallen. */
export const STALE_AFTER_SECONDS = 300;

export type JobFormat = "pdf" | "pptx";
export type ExportJob = {
  id: string;
  presentation_id: string;
  version: number;
  format: JobFormat;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  input_revision: string;
  result_hash: string | null;
  error: string | null;
};

export class ExportJobs {
  constructor(private pool: Pool) {}

  /**
   * Een taak aanvragen. Bestaat hij al, dan komt die terug: een mislukte taak
   * wordt opnieuw in de wachtrij gezet, een afgeronde taak blijft afgerond.
   */
  request(ctx: Context, input: unknown) {
    const value = z
      .object({
        id,
        presentationId: id,
        version: z.number().int().min(1).max(10000),
        format: z.enum(["pdf", "pptx"]),
      })
      .strict()
      .parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const version = (
        await c.query(
          "SELECT content_hash FROM presentation_versions WHERE presentation_id=$1 AND version=$2",
          [value.presentationId, value.version],
        )
      ).rows[0];
      if (!version)
        throw new DomainError(
          "NOT_FOUND",
          "Publiceer eerst een versie om te kunnen exporteren.",
          404,
        );
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":export-jobs",
      ]);
      const existing = (
        await c.query(
          "SELECT * FROM export_jobs WHERE presentation_id=$1 AND version=$2 AND format=$3",
          [value.presentationId, value.version, value.format],
        )
      ).rows[0] as ExportJob | undefined;
      if (existing) {
        if (existing.status === "failed" && existing.attempts < MAX_ATTEMPTS)
          await c.query(
            "UPDATE export_jobs SET status='queued',error=NULL WHERE id=$1",
            [existing.id],
          );
        return this.read(c, existing.id);
      }
      await c.query(
        "INSERT INTO export_jobs(organization_id,id,presentation_id,version,format,status,input_revision,user_id) VALUES($1,$2,$3,$4,$5,'queued',$6,$7)",
        [
          ctx.organizationId,
          value.id,
          value.presentationId,
          value.version,
          value.format,
          version.content_hash,
          ctx.userId,
        ],
      );
      return this.read(c, value.id);
    });
  }

  private async read(c: PoolClient, jobId: string) {
    const row = (
      await c.query(
        "SELECT id,presentation_id,version,format,status,attempts,input_revision,result_hash,error FROM export_jobs WHERE id=$1",
        [jobId],
      )
    ).rows[0];
    if (!row) throw new DomainError("NOT_FOUND", "Taak niet gevonden.", 404);
    return row as ExportJob;
  }

  get(ctx: Context, jobId: string) {
    return inTenant(this.pool, ctx.organizationId, (c) => this.read(c, jobId));
  }

  list(ctx: Context, presentationId: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => ({
      items: (
        await c.query(
          "SELECT id,presentation_id,version,format,status,attempts,input_revision,result_hash,error FROM export_jobs WHERE presentation_id=$1 ORDER BY created_at DESC LIMIT 50",
          [presentationId],
        )
      ).rows as ExportJob[],
    }));
  }

  /**
   * De volgende taak oppakken. Taken die te lang op `running` staan worden weer
   * vrijgegeven; hun proces is dan vermoedelijk weggevallen. `FOR UPDATE SKIP
   * LOCKED` zorgt dat twee werkers nooit dezelfde taak pakken.
   */
  claim(organizationId: string) {
    return inTenant(this.pool, organizationId, async (c) => {
      await c.query(
        `UPDATE export_jobs SET status='queued'
          WHERE status='running' AND started_at < now() - $1 * interval '1 second'
            AND attempts < $2`,
        [STALE_AFTER_SECONDS, MAX_ATTEMPTS],
      );
      const row = (
        await c.query(
          `SELECT id FROM export_jobs WHERE status='queued' AND attempts < $1
             ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [MAX_ATTEMPTS],
        )
      ).rows[0];
      if (!row) return null;
      await c.query(
        "UPDATE export_jobs SET status='running',attempts=attempts+1,started_at=now() WHERE id=$1",
        [row.id],
      );
      return this.read(c, row.id);
    });
  }

  /**
   * Het resultaat vastleggen. Bestand en status gaan in één transactie, zodat
   * een onvolledig bestand nooit als klaar wordt getoond.
   */
  finish(
    organizationId: string,
    job: ExportJob,
    bytes: Buffer,
    contentHash: string,
  ) {
    const hash = createHash("sha256").update(bytes).digest("hex");
    return inTenant(this.pool, organizationId, async (c) => {
      await c.query("BEGIN");
      try {
        await c.query(
          job.format === "pdf"
            ? "INSERT INTO presentation_exports(organization_id,presentation_id,version,content_hash,pdf,pdf_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING"
            : "INSERT INTO presentation_decks(organization_id,presentation_id,version,content_hash,pptx,pptx_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [
            organizationId,
            job.presentation_id,
            job.version,
            contentHash,
            bytes,
            hash,
          ],
        );
        // Bestond het bestand al, dan telt die hash: het resultaat moet
        // verwijzen naar wat er werkelijk ligt en niet naar wat we net maakten.
        const stored = (
          await c.query(
            job.format === "pdf"
              ? "SELECT pdf_hash AS hash FROM presentation_exports WHERE presentation_id=$1 AND version=$2"
              : "SELECT pptx_hash AS hash FROM presentation_decks WHERE presentation_id=$1 AND version=$2",
            [job.presentation_id, job.version],
          )
        ).rows[0];
        await c.query(
          "UPDATE export_jobs SET status='done',result_hash=$1,error=NULL,finished_at=now() WHERE id=$2",
          [stored?.hash ?? hash, job.id],
        );
        await c.query("COMMIT");
        return (stored?.hash ?? hash) as string;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    });
  }

  fail(organizationId: string, jobId: string, message: string) {
    return inTenant(this.pool, organizationId, async (c) => {
      await c.query(
        "UPDATE export_jobs SET status='failed',error=$1,finished_at=now() WHERE id=$2",
        [message.slice(0, 500), jobId],
      );
    });
  }
}
