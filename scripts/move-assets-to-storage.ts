/**
 * Verplaatst assetbytes van de database naar de opslagprovider.
 *
 * Migration 0018 laat bestaande rijen met rust: die houden hun bytes in de
 * kolom tot een beheerder ze bewust verplaatst. Dit script doet dat, en toont
 * eerst wat het gaat doen. Het is herhaalbaar: al verplaatste rijen slaat het
 * over, en het leegt de kolom pas nadat het object teruggelezen en vergeleken is.
 *
 *   pnpm tsx scripts/move-assets-to-storage.ts            # alleen tonen
 *   pnpm tsx scripts/move-assets-to-storage.ts --uitvoeren
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Pool, guardPool } from "../packages/db/src/index";
import {
  LocalStorage,
  type StorageProvider,
} from "../packages/storage/src/index";

export type MoveReport = {
  bekeken: number;
  verplaatst: number;
  overgeslagen: number;
  mislukt: { id: string; reden: string }[];
};

/**
 * Verplaatst per rij en commit per rij: valt het script halverwege om, dan is
 * wat verplaatst is klaar en de rest onaangeroerd. Er raakt nooit iets zoek,
 * want de kolom gaat pas leeg als het object is teruggelezen en gelijk bevonden.
 */
export async function moveUnderlaysToStorage(
  pool: Pool,
  storage: StorageProvider,
  { uitvoeren = false }: { uitvoeren?: boolean } = {},
): Promise<MoveReport> {
  const report: MoveReport = {
    bekeken: 0,
    verplaatst: 0,
    overgeslagen: 0,
    mislukt: [],
  };
  const openstaand = await pool.query(
    "SELECT organization_id,id,octet_length(bytes) AS size FROM underlay_assets WHERE stored=false ORDER BY created_at",
  );
  report.bekeken = openstaand.rowCount ?? 0;
  for (const rij of openstaand.rows as {
    organization_id: string;
    id: string;
    size: number;
  }[]) {
    if (!uitvoeren) {
      report.overgeslagen++;
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Vergrendel de rij zodat een gelijktijdige upload er niet tussen komt.
      const rij2 = (
        await client.query(
          "SELECT bytes FROM underlay_assets WHERE organization_id=$1 AND id=$2 AND stored=false FOR UPDATE",
          [rij.organization_id, rij.id],
        )
      ).rows[0];
      if (!rij2) {
        await client.query("ROLLBACK");
        report.overgeslagen++;
        continue;
      }
      const bytes = rij2.bytes as Buffer;
      const key = { organizationId: rij.organization_id, assetId: rij.id };
      await storage.put(key, bytes);
      const terug = Buffer.from(await storage.get(key));
      const zelfde =
        createHash("sha256").update(terug).digest("hex") ===
        createHash("sha256").update(bytes).digest("hex");
      if (!zelfde) throw new Error("teruggelezen object wijkt af");
      await client.query(
        "UPDATE underlay_assets SET bytes=NULL,stored=true,byte_size=$3 WHERE organization_id=$1 AND id=$2",
        [rij.organization_id, rij.id, bytes.length],
      );
      await client.query("COMMIT");
      report.verplaatst++;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      report.mislukt.push({
        id: rij.id,
        reden: e instanceof Error ? e.message : String(e),
      });
    } finally {
      client.release();
    }
  }
  return report;
}

/**
 * De documenttabellen: offerte-PDF's, presentatie-PDF's en PowerPoint-exports.
 * Deze dragen de grootste bestanden — tot 40 MB per stuk — en hebben sinds
 * migration 0019 elk een eigen opaque `asset_id`.
 */
const DOCUMENTEN = [
  { tabel: "quote_exports", kolom: "pdf" },
  { tabel: "presentation_exports", kolom: "pdf" },
  { tabel: "presentation_decks", kolom: "pptx" },
] as const;

/**
 * Zelfde belofte als bij de onderleggers: per rij, in een eigen transactie, en
 * de kolom gaat pas leeg nadat het object is teruggelezen en gelijk bevonden.
 * De sleutel is hier de `asset_id` die de rij al draagt.
 */
export async function moveDocumentsToStorage(
  pool: Pool,
  storage: StorageProvider,
  { uitvoeren = false }: { uitvoeren?: boolean } = {},
): Promise<MoveReport> {
  const report: MoveReport = {
    bekeken: 0,
    verplaatst: 0,
    overgeslagen: 0,
    mislukt: [],
  };
  for (const { tabel, kolom } of DOCUMENTEN) {
    const openstaand = await pool.query(
      `SELECT organization_id,asset_id FROM ${tabel} WHERE stored=false ORDER BY created_at`,
    );
    report.bekeken += openstaand.rowCount ?? 0;
    for (const rij of openstaand.rows as {
      organization_id: string;
      asset_id: string;
    }[]) {
      if (!uitvoeren) {
        report.overgeslagen++;
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const huidig = (
          await client.query(
            `SELECT ${kolom} AS bytes FROM ${tabel} WHERE organization_id=$1 AND asset_id=$2 AND stored=false FOR UPDATE`,
            [rij.organization_id, rij.asset_id],
          )
        ).rows[0];
        if (!huidig) {
          await client.query("ROLLBACK");
          report.overgeslagen++;
          continue;
        }
        const bytes = huidig.bytes as Buffer;
        const key = {
          organizationId: rij.organization_id,
          assetId: rij.asset_id,
        };
        await storage.put(key, bytes);
        const terug = Buffer.from(await storage.get(key));
        if (
          createHash("sha256").update(terug).digest("hex") !==
          createHash("sha256").update(bytes).digest("hex")
        )
          throw new Error("teruggelezen object wijkt af");
        await client.query(
          `UPDATE ${tabel} SET ${kolom}=NULL,stored=true,byte_size=$3 WHERE organization_id=$1 AND asset_id=$2`,
          [rij.organization_id, rij.asset_id, bytes.length],
        );
        await client.query("COMMIT");
        report.verplaatst++;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        report.mislukt.push({
          id: `${tabel}:${rij.asset_id}`,
          reden: e instanceof Error ? e.message : String(e),
        });
      } finally {
        client.release();
      }
    }
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const uitvoeren = process.argv.includes("--uitvoeren");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL ontbreekt. Zet die op de runtimeverbinding van de studio.",
    );
    process.exit(1);
  }
  const root = process.env.STORAGE_DIR ?? resolve("work/assets");
  const pool = guardPool(
    new Pool({ connectionString: url, max: 2 }),
    "runtime",
  );
  console.log(`Database : ${url.replace(/:\/\/[^@]*@/, "://***@")}`);
  console.log(`Opslag   : ${root}`);
  console.log(
    uitvoeren
      ? "Modus    : uitvoeren — bytes gaan naar de opslag en de kolom wordt geleegd"
      : "Modus    : tonen — er wordt niets gewijzigd (geef --uitvoeren om te verplaatsen)",
  );
  try {
    const opslag = new LocalStorage(root);
    const onderleggers = await moveUnderlaysToStorage(pool, opslag, {
      uitvoeren,
    });
    const documenten = await moveDocumentsToStorage(pool, opslag, {
      uitvoeren,
    });
    for (const [wat, r] of [
      ["Onderleggers", onderleggers],
      ["Documenten  ", documenten],
    ] as const)
      console.log(
        `${wat}: bekeken ${r.bekeken}, verplaatst ${r.verplaatst}, overgeslagen ${r.overgeslagen}, mislukt ${r.mislukt.length}.`,
      );
    const mislukt = [...onderleggers.mislukt, ...documenten.mislukt];
    for (const f of mislukt) console.error(`  ${f.id}: ${f.reden}`);
    process.exit(mislukt.length ? 1 : 0);
  } finally {
    await pool.end();
  }
}
