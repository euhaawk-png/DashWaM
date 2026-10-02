import postgres from "postgres";
import bcrypt from "bcryptjs";
import "dotenv/config";

// Seeds a platform admin + a demo tenant with three users (owner/manager/seller).
// Idempotent. Credentials printed at the end — CHANGE THEM in any real deploy.
async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL (or DATABASE_URL) must be set");
  const sql = postgres(url, { max: 1 });

  const password = process.env.SEED_PASSWORD ?? "Trocar-esta-senha-123";
  const hash = await bcrypt.hash(password, 12);

  const upsertUser = async (email: string, name: string, isAdmin = false) => {
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, is_platform_admin)
      VALUES (${email}, ${name}, ${hash}, ${isAdmin})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id`;
    return rows[0].id as string;
  };

  await upsertUser("admin@plataforma.local", "Admin da Plataforma", true);

  const tenantRows = await sql`
    INSERT INTO tenants (name, slug) VALUES ('Empresa Demo', 'empresa-demo')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;
  const tenantId = tenantRows[0].id as string;

  const withTenant = (fn: (tx: postgres.TransactionSql) => Promise<void>) =>
    sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await fn(tx);
    });

  await withTenant(async (tx) => {
    const existing = await tx`SELECT id FROM pipelines WHERE tenant_id = ${tenantId} LIMIT 1`;
    if (existing.length === 0) {
      const [p] = await tx`
        INSERT INTO pipelines (tenant_id, name, is_default) VALUES (${tenantId}, 'Funil de vendas', true) RETURNING id`;
      const stages = [
        ["Novo lead", "open"], ["Em atendimento", "open"], ["Proposta", "open"], ["Ganhou", "won"], ["Perdeu", "lost"],
      ];
      for (let i = 0; i < stages.length; i++) {
        await tx`INSERT INTO stages (tenant_id, pipeline_id, name, kind, position)
                 VALUES (${tenantId}, ${p.id as string}, ${stages[i][0]}, ${stages[i][1]}, ${i})`;
      }
      await tx`INSERT INTO lead_routing_rules (tenant_id, source, mode) VALUES (${tenantId}, NULL, 'round_robin')`;
    }
  });

  for (const [email, name, role] of [
    ["dono@demo.local", "Dona Demo", "owner"],
    ["gerente@demo.local", "Gerente Demo", "manager"],
    ["vendedor@demo.local", "Vendedor Demo", "seller"],
  ] as const) {
    const userId = await upsertUser(email, name);
    await withTenant(async (tx) => {
      await tx`
        INSERT INTO memberships (tenant_id, user_id, role)
        VALUES (${tenantId}, ${userId}, ${role})
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`;
    });
  }

  console.log("Seed concluído.");
  console.log(`Senha de todos os usuários seed: ${password}`);
  console.log("Usuários: admin@plataforma.local (admin), dono@demo.local, gerente@demo.local, vendedor@demo.local");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
