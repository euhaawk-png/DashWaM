import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";
import "dotenv/config";

// Applies drizzle/*.sql in order, tracking applied files in _migrations.
// Uses DATABASE_ADMIN_URL (owner role) — the app itself runs as crm_app.
async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL (or DATABASE_URL) must be set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied = new Set((await sql`SELECT name FROM _migrations`).map((r) => r.name as string));

  const dir = join(__dirname, "..", "drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`Applying ${file}…`);
    const content = readFileSync(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
  }
  console.log("Migrations up to date.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
