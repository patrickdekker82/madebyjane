import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { bootstrapOwner } from "../packages/auth/src/setup";
import { z } from "zod";
const secrets = JSON.parse(
  await readFile("work/local-db/credentials.json", "utf8"),
);
const pool = new Pool({
  connectionString: `postgresql://postgres:${secrets.admin}@127.0.0.1:55432/postgres`,
});
const count = await pool.query('SELECT count(*) FROM identity."user"');
if (Number(count.rows[0].count) > 0) {
  await pool.end();
  throw new Error("Eerste eigenaar bestaat al; setup is gesloten.");
}
const rl = createInterface({ input: stdin, output: stdout });
try {
  const name = z
    .string()
    .min(1)
    .max(120)
    .parse(await rl.question("Naam eigenaar: "));
  const email = z.email().parse(await rl.question("E-mailadres: "));
  stdout.write("Wachtwoord (12–128 tekens, invoer verborgen): ");
  rl.close();
  let password = "";
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
  await bootstrapOwner(pool, "http://127.0.0.1:4310", secrets.session, {
    name,
    email,
    password,
    organizationName: "Mijn interieurstudio",
  });
  console.log("Eigenaar aangemaakt. Log in via http://127.0.0.1:4310");
} finally {
  if (stdin.isTTY) stdin.setRawMode(false);
  rl.close();
  await pool.end();
}
