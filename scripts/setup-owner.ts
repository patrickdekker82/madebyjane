import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import { z } from "zod";
import { bootstrapOwner } from "../packages/auth/src/setup";

/**
 * De eerste eigenaar van een productie-installatie.
 *
 * `scripts/setup.ts` doet hetzelfde voor ontwikkelaars, maar is vastgeklonken
 * aan de meegeleverde PostgreSQL op poort 55432 en aan de sleutels uit
 * `work/local-db`. In een productieomgeving bestaan die geen van beide, en
 * zonder deze tweede ingang komt er dus wél een draaiende app maar nooit iemand
 * naar binnen.
 *
 * Waarom de migratierol en niet de gewone: de draaiende app mag met opzet geen
 * organisaties of leden aanmaken — `studio_auth` heeft op
 * `identity.organization` en `identity.membership` alleen SELECT. Dat is geen
 * omissie maar de grens die maakt dat een gekaapte app zichzelf geen tweede
 * eigenaar kan geven. Deze stap hoort daarom bij de installatie, met de
 * credentials van de installateur, en is nooit aan HTTP geknoopt.
 */
const { MIGRATION_DATABASE_URL, PUBLIC_BASE_URL, AUTH_SECRET } = process.env;
if (!MIGRATION_DATABASE_URL || !PUBLIC_BASE_URL || !AUTH_SECRET)
  throw new Error(
    "MIGRATION_DATABASE_URL, PUBLIC_BASE_URL en AUTH_SECRET zijn alle drie nodig. Gebruik scripts/setup-owner.sh, die ze uit .env leest.",
  );

const pool = new Pool({ connectionString: MIGRATION_DATABASE_URL });
/*
 * Eerst kijken of er al iemand is. `bootstrapOwner` controleert dat zelf nog
 * een keer binnen zijn transactie — dat is de echte grendel — maar wie per
 * ongeluk opnieuw installeert hoort dat te horen vóór hij een wachtwoord
 * intypt, niet erna.
 */
const bestaat = await pool.query('SELECT count(*) FROM identity."user"');
if (Number(bestaat.rows[0].count) > 0) {
  await pool.end();
  throw new Error(
    "Er bestaat al een gebruiker; de eerste-eigenaarsetup is gesloten. Raakte je de toegang kwijt, gebruik dan het accountherstel uit docs/manuals/accountherstel.md.",
  );
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  const name = z
    .string()
    .min(1)
    .max(120)
    .parse(await rl.question("Naam eigenaar: "));
  const email = z.email().parse(await rl.question("E-mailadres: "));
  const organizationName = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .parse(await rl.question("Naam van de werkruimte: "));
  stdout.write("Wachtwoord (12–128 tekens, invoer verborgen): ");
  rl.close();
  /*
   * Het wachtwoord wordt teken voor teken gelezen met echo uit, zodat het niet
   * in beeld komt en niet in de shellgeschiedenis van de installateur belandt.
   * Dezelfde aanpak als in de ontwikkelsetup.
   */
  let password = "";
  if (!stdin.isTTY)
    throw new Error(
      "Deze setup vraagt om een wachtwoord en heeft een terminal nodig. Draai hem met -it, zoals scripts/setup-owner.sh doet.",
    );
  stdin.setRawMode(true);
  stdin.resume();
  await new Promise<void>((resolve, reject) => {
    const handler = (chunk: Buffer) => {
      for (const ch of chunk.toString()) {
        if (ch === "\u0003") {
          stdin.off("data", handler);
          reject(new Error("Afgebroken"));
          return;
        }
        if (ch === "\r" || ch === "\n") {
          stdin.off("data", handler);
          resolve();
          return;
        }
        if (ch === "\u007f") password = password.slice(0, -1);
        else password += ch;
      }
    };
    stdin.on("data", handler);
  });
  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\n");
  z.string().min(12).max(128).parse(password);
  await bootstrapOwner(pool, PUBLIC_BASE_URL, AUTH_SECRET, {
    name,
    email,
    password,
    organizationName,
  });
  console.log(`Eigenaar aangemaakt. Log in via ${PUBLIC_BASE_URL}`);
  console.log(
    "Zet daarna meteen MFA aan onder Beveiliging; de HTTPS-routes vragen erom.",
  );
} finally {
  if (stdin.isTTY) stdin.setRawMode(false);
  rl.close();
  await pool.end();
}
