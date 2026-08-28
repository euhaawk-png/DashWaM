/**
 * Prova de isolamento multi-tenant (Fase 1, critério de aceite):
 * tenant A não lê dado do tenant B — nem por listagem, nem por fetch-by-id,
 * nem por escrita cruzada. Requer um banco migrado e DATABASE_URL apontando
 * para o papel da aplicação (crm_app, sem BYPASSRLS).
 *
 *   npm run db:migrate && npm run test:rls
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import "dotenv/config";

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb("RLS tenant isolation", () => {
  let admin: postgres.Sql;
  let app: postgres.Sql;
  let tenantA: string;
  let tenantB: string;
  let contactAId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_ADMIN_URL ?? url!, { max: 1 });
    app = postgres(url!, { max: 1 });

    // Sanity: the app role must NOT bypass RLS.
    const [{ rolbypassrls }] = await app`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rolbypassrls).toBe(false);

    [{ id: tenantA }] = await admin`
      INSERT INTO tenants (name, slug) VALUES ('RLS Test A', ${"rls-a-" + Date.now()}) RETURNING id`;
    [{ id: tenantB }] = await admin`
      INSERT INTO tenants (name, slug) VALUES ('RLS Test B', ${"rls-b-" + Date.now()}) RETURNING id`;
  });

  afterAll(async () => {
    await admin`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
    await admin.end();
    await app.end();
  });

  const asTenant = <T>(tenantId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) =>
    app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });

  it("permite escrever e ler dentro do próprio tenant", async () => {
    const rows = await asTenant(tenantA, async (tx) => {
      const [c] = await tx`
        INSERT INTO contacts (tenant_id, phone, name) VALUES (${tenantA}, '+5511999990001', 'Contato A')
        RETURNING id`;
      contactAId = c.id;
      return tx`SELECT * FROM contacts WHERE id = ${c.id}`;
    });
    expect(rows).toHaveLength(1);
  });

  it("tenant B não lista dados do tenant A", async () => {
    const rows = await asTenant(tenantB, (tx) => tx`SELECT * FROM contacts`);
    expect(rows).toHaveLength(0);
  });

  it("tenant B não lê registro do tenant A nem por fetch-by-id (PK)", async () => {
    const rows = await asTenant(tenantB, (tx) => tx`SELECT * FROM contacts WHERE id = ${contactAId}`);
    expect(rows).toHaveLength(0);
  });

  it("tenant B não atualiza nem exclui registro do tenant A", async () => {
    const updated = await asTenant(tenantB, (tx) =>
      tx`UPDATE contacts SET name = 'hacked' WHERE id = ${contactAId} RETURNING id`
    );
    expect(updated).toHaveLength(0);
    const deleted = await asTenant(tenantB, (tx) =>
      tx`DELETE FROM contacts WHERE id = ${contactAId} RETURNING id`
    );
    expect(deleted).toHaveLength(0);
  });

  it("tenant B não consegue inserir linha com tenant_id do tenant A (WITH CHECK)", async () => {
    await expect(
      asTenant(tenantB, (tx) =>
        tx`INSERT INTO contacts (tenant_id, phone, name) VALUES (${tenantA}, '+5511999990002', 'Intruso')`
      )
    ).rejects.toThrow();
  });

  it("sem contexto de tenant, nenhuma linha é visível (query esquecida)", async () => {
    const rows = await app`SELECT * FROM contacts WHERE id = ${contactAId}`;
    expect(rows).toHaveLength(0);
  });

  it("audit log é append-only: UPDATE e DELETE são bloqueados", async () => {
    const [entry] = await asTenant(tenantA, async (tx) => {
      return tx`
        INSERT INTO activity_log (tenant_id, action) VALUES (${tenantA}, 'test') RETURNING id`;
    });
    // Depending on the role, the write is either rejected (REVOKE on crm_app)
    // or filtered to zero rows (no UPDATE/DELETE policy). Both must leave the
    // entry intact.
    await asTenant(tenantA, (tx) =>
      tx`UPDATE activity_log SET action = 'x' WHERE id = ${entry.id}`.catch(() => undefined)
    );
    await asTenant(tenantA, (tx) =>
      tx`DELETE FROM activity_log WHERE id = ${entry.id}`.catch(() => undefined)
    );
    const rows = await asTenant(tenantA, (tx) => tx`SELECT action FROM activity_log WHERE id = ${entry.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("test");
  });
});
