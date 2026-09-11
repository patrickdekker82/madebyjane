import type { Pool } from "pg";
import { inTenant } from "../../db/src/index";
import type {
  Presentation,
  PresentationContent,
} from "../../contracts/src/presentations";
import { presentationHtml } from "../../documents/src/presentation";
import { presentationPptx } from "../../documents/src/presentation-pptx";
import { renderQuotePdf } from "../../documents/src/quote-pdf";
import { renderSvgPng } from "../../documents/src/raster";
import { ExportJobs } from "./export-jobs";

/**
 * De exportwerker.
 *
 * Hij pakt één taak tegelijk, maakt het bestand en legt het samen met de status
 * in dezelfde transactie vast. Valt hij halverwege om, dan blijft de taak op
 * `running` staan en pakt een volgende ronde hem weer op; er ontstaat geen
 * tweede publicatie, want de taak hoort bij één gepubliceerde versie en het
 * wegschrijven is idempotent.
 *
 * Zware afhankelijkheden — Chromium voor de PDF en voor het omzetten van
 * planbladen naar afbeelding — zitten hier en niet in de webverzoeken, zodat een
 * trage export het bewerken niet ophoudt.
 */
export type WorkerDeps = {
  renderPdf?: (html: string) => Promise<Buffer>;
  renderPng?: (
    svg: string,
    widthMm: number,
    heightMm: number,
  ) => Promise<Buffer>;
};

export async function runOneExport(
  pool: Pool,
  organizationId: string,
  deps: WorkerDeps = {},
) {
  const jobs = new ExportJobs(pool);
  const job = await jobs.claim(organizationId);
  if (!job) return null;
  try {
    const version = await inTenant(pool, organizationId, async (c) => {
      const row = (
        await c.query(
          "SELECT definition,content,content_hash FROM presentation_versions WHERE presentation_id=$1 AND version=$2",
          [job.presentation_id, job.version],
        )
      ).rows[0];
      if (!row) throw new Error("De gepubliceerde versie bestaat niet meer.");
      return row as {
        definition: Presentation;
        content: PresentationContent;
        content_hash: string;
      };
    });
    const bytes =
      job.format === "pdf"
        ? await (deps.renderPdf ?? renderQuotePdf)(
            presentationHtml(version.definition, version.content),
          )
        : await deck(version, deps);
    const hash = await jobs.finish(
      organizationId,
      job,
      bytes,
      version.content_hash,
    );
    return { job, hash };
  } catch (e) {
    await jobs.fail(
      organizationId,
      job.id,
      e instanceof Error ? e.message : "Export mislukt.",
    );
    return { job, hash: null };
  }
}

async function deck(
  version: { definition: Presentation; content: PresentationContent },
  deps: WorkerDeps,
) {
  const png = deps.renderPng ?? renderSvgPng;
  const sheets: Record<string, Buffer> = {};
  for (const block of version.content.blocks)
    if (block.type === "plan" && block.svg)
      sheets[block.blockId] = await png(
        block.svg,
        block.widthMm,
        block.heightMm,
      );
  return presentationPptx(version.definition, version.content, sheets);
}

/**
 * Blijven draaien tot er niets meer te doen is. Geeft terug hoeveel taken er
 * zijn afgehandeld, zodat een beheerder ziet of er iets gebeurd is.
 */
export async function drainExports(
  pool: Pool,
  organizationId: string,
  deps: WorkerDeps = {},
  max = 20,
) {
  let done = 0;
  for (let i = 0; i < max; i++) {
    const result = await runOneExport(pool, organizationId, deps);
    if (!result) break;
    done++;
  }
  return done;
}
