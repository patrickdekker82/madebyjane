import { test, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { localDatabase } from "../scripts/local-db";
import { migrate } from "../packages/db/src/index";
import { bootstrapOwner } from "../packages/auth/src/setup";

/*
 * De eerste eigenaar van een productie-installatie, met de rolverdeling die daar
 * werkelijk geldt. In ontwikkeling draaien migrations als superuser en zegt een
 * geslaagde setup dus niets over productie: daar is `studio_migrator` eigenaar
 * van de database en draait de app als `studio_runtime` en `studio_auth`.
 *
 * Deze test bouwt die verdeling na — een eigen database met studio_migrator als
 * eigenaar — en legt twee dingen vast die bij een installatie fout kunnen gaan
 * en pas bij het inloggen zouden blijken.
 */
test("de eerste eigenaar ontstaat met de migratierol, en de app kan dat zelf niet", async () => {
  const directory = await mkdtemp("work/setup-prod-");
  const db = await localDatabase(directory, 55436);
  const wachtwoord = randomBytes(24).toString("hex");
  const migratorPassword = randomBytes(24).toString("hex");
  const authPassword = randomBytes(24).toString("hex");
  let migrator: Pool | undefined;
  let identity: Pool | undefined;
  try {
    /*
     * Nabouw van infra/docker/postgres-init.sh: een migratierol met CREATEROLE
     * maar zonder superuser- of RLS-bypassrechten, en een database waarvan hij
     * eigenaar is. De twee approllen bestaan al in het cluster; de migration
     * maakt ze met IF NOT EXISTS aan.
     */
    await db.admin.query(
      `CREATE ROLE studio_migrator LOGIN NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS PASSWORD '${migratorPassword}'`,
    );
    await db.admin.query(`ALTER ROLE studio_auth PASSWORD '${authPassword}'`);
    await db.admin.query("CREATE DATABASE productie OWNER studio_migrator");
    const url = (user: string, password: string) =>
      `postgresql://${user}:${password}@127.0.0.1:55436/productie`;

    migrator = new Pool({
      connectionString: url("studio_migrator", migratorPassword),
    });
    // De migrator legt het schema aan; daarmee is hij eigenaar van de tabellen.
    await migrate(migrator);

    await bootstrapOwner(
      migrator,
      "https://studio.example.test",
      randomBytes(48).toString("hex"),
      {
        name: "Eigenaar",
        email: "eigenaar@example.test",
        password: wachtwoord,
        organizationName: "Studio Voorbeeld",
      },
    );

    const tel = async (tabel: string) =>
      Number(
        (await migrator!.query(`SELECT count(*) FROM identity.${tabel}`))
          .rows[0].count,
      );
    expect(await tel('"user"')).toBe(1);
    expect(await tel("organization")).toBe(1);
    // Zonder lidmaatschap is de eigenaar geen eigenaar van iets.
    expect(
      (await migrator.query("SELECT role FROM identity.membership LIMIT 1"))
        .rows[0].role,
    ).toBe("owner");

    // Twee keer installeren mag geen tweede eigenaar opleveren.
    await expect(
      bootstrapOwner(
        migrator,
        "https://studio.example.test",
        randomBytes(48).toString("hex"),
        {
          name: "Tweede",
          email: "tweede@example.test",
          password: randomBytes(24).toString("hex"),
          organizationName: "Nog een studio",
        },
      ),
    ).rejects.toThrow(/setup is gesloten/);

    /*
     * En de reden dat deze stap bij de installateur hoort en niet bij de app:
     * de rol waarmee de app aanmeldingen afhandelt mag zelf geen organisatie
     * aanmaken. Zou dat wel kunnen, dan kon een gekaapte app zichzelf een
     * tweede werkruimte met een eigen eigenaar geven.
     */
    identity = new Pool({ connectionString: url("studio_auth", authPassword) });
    await expect(
      identity.query(
        "INSERT INTO identity.organization VALUES(gen_random_uuid(),'Sluiproute')",
      ),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await migrator?.end();
    await identity?.end();
    await db.stop();
  }
}, 120000);
