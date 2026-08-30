# Checklist de segurança — CRM v1 (seção 9 da especificação)

Revisão item a item. Status: ✅ implementado e verificado · ⚠️ depende de ação do operador · ❌ pendente.
"Verificação" indica como o item foi validado nesta entrega.

## Isolamento e acesso

| Item | Status | Evidência | Verificação |
| --- | --- | --- | --- |
| RLS em todas as tabelas de tenant com `FORCE ROW LEVEL SECURITY` | ✅ | `drizzle/0001_rls.sql` (loop ENABLE+FORCE em 18 tabelas) | `tests/rls.test.ts` 7/7 verde em banco limpo |
| Políticas restritivas `tenant_id = current_setting('app.current_tenant_id')::uuid` em USING **e** WITH CHECK | ✅ | `drizzle/0001_rls.sql` política `tenant_isolation` | Teste de INSERT cruzado rejeitado (WITH CHECK) |
| Middleware/contexto único resolve tenant por request; sem métodos "globais" por padrão | ✅ | `src/db/index.ts` (`withTenant` é o único caminho; client global só para tabelas de plataforma) | Query sem contexto retorna 0 linhas (teste "query esquecida") |
| Todo fetch-by-id valida o tenant além da PK | ✅ | RLS cobre por construção; handlers ainda filtram por `tenantId` (ex.: `api/deals/[dealId]/route.ts`) | Teste fetch-by-id entre tenants retorna vazio |
| Autorização por papel no servidor em toda rota/ação | ✅ | `src/lib/auth/guard.ts` (`requireRole`, `apiTenantCtx`, `hasRole`); usado em todas as actions/rotas | E2E: seller não vê filtros de gerente, menu Integrações, nem conversa não atribuída a ele |
| Nenhuma listagem sem paginação e sem escopo de tenant | ✅ | Contatos paginados (`app/contatos/page.tsx`), demais listas com `limit` + escopo RLS | Revisão de código das rotas de listagem |

## Credenciais e dados sensíveis

| Item | Status | Evidência | Verificação |
| --- | --- | --- | --- |
| Tokens da Meta e chaves de webhook criptografados em repouso (AES-256-GCM, chave em env) | ✅ | `src/lib/crypto.ts` (`encryptSecret`); usos em `es-callback`, `integracoes/actions.ts` | Coluna `access_token_enc`/`secret_enc` contém `iv.tag.cipher`, nunca texto puro |
| Tokens nunca logados | ✅ | Nenhum `console.*` com token; erros logam apenas status/detalhe truncado | grep por logs nos módulos WhatsApp |
| Secrets somente em env; `.env` fora do git | ✅ | `crm/.gitignore` inclui `.env`; `.env.example` sem valores | `git status` limpo com `.env` presente |
| Hash de senha bcrypt custo adequado | ✅ | `src/lib/password.ts` (bcryptjs, custo 12) + validação de força | Login E2E |
| Tokens de reset e convite com hash no banco e expiração | ✅ | `password_reset_tokens`/`invitations` guardam SHA-256; 30 min / 7 dias | `(auth)/actions.ts` |

## Superfície pública

| Item | Status | Evidência | Verificação |
| --- | --- | --- | --- |
| `X-Hub-Signature-256` validada em todo POST da Meta; sem assinatura → 401 + registro | ✅ | `src/lib/whatsapp/signature.ts`; `api/wa/webhook`, `api/hooks/meta-leadgen` | Simulação: assinatura válida 200, inválida 401 |
| Chave do Google validada no payload (`google_key`); HMAC/chave nos genéricos | ✅ | `api/hooks/[tenant]/[token]/route.ts` (comparação constant-time) | Simulação: chave errada → 401 + evento `rejected` no log |
| Rate limiting em todos os endpoints públicos por IP e por recurso, bloqueio progressivo | ✅ | `src/lib/rate-limit.ts` (janela fixa em Postgres + lockout progressivo); aplicado em login, reset, 2FA, formulários, hooks | Revisão + limites exercitados em dev |
| Validação/sanitização de input (zod); mensagens de WhatsApp nunca renderizadas como HTML | ✅ | zod em todas as rotas/actions; corpo de mensagem renderizado como texto React (`InboxClient.tsx`, sem `dangerouslySetInnerHTML`) | grep por `dangerouslySetInnerHTML` → zero ocorrências |
| Uploads/mídia por URL com escopo de tenant, nunca caminho previsível | ✅ | `api/wa/media/[mediaId]/route.ts` (sessão + acesso à conversa + proxy autenticado) | Rota exige sessão; 404 sem vínculo |
| Headers de segurança: CSP estrita, HSTS, nosniff, frame-ancestors (iframe só no embed) | ✅ | `next.config.ts` (CSP com allowlist Meta/Fonts; `frame-ancestors *` apenas em `/f/:slug/embed`) | curl dos headers em dev |
| CSRF nas mutações; CORS fechado | ✅ | Server actions (origin check nativo do Next) + `sameOrigin()` nas rotas de mutação; cookies `SameSite=Lax`; nenhum header CORS aberto (rotas públicas de form/hook não usam cookie) | Revisão de código |

## Operação

| Item | Status | Evidência | Verificação |
| --- | --- | --- | --- |
| Audit log imutável (append-only), retenção 12 meses | ✅ | `activity_log`: RLS sem política de UPDATE/DELETE + `REVOKE` (`0001_rls.sql`); nenhuma rotina de expurgo criada (retenção indefinida ≥ 12 meses) | Teste: UPDATE/DELETE bloqueados |
| Logs de aplicação sem PII desnecessária | ✅ | `src/lib/phone.ts` (`maskPhone`); handlers não logam telefone/corpo de mensagem | grep por `console.log` nos fluxos de mensagem |
| Backups automáticos diários com teste de restauração documentado | ⚠️ | Responsabilidade do banco gerenciado (Supabase/Neon/RDS) — habilitar PITR/backup diário no provedor e ensaiar restauração; ver README | Fora do código |
| Dependências auditadas; sem libs abandonadas na cadeia crítica | ✅ | `npm audit`: 0 vulnerabilidades (drizzle-orm atualizado p/ 0.45.2 corrigindo GHSA-gpj5-g38j-94v9; `overrides` força postcss ≥ 8.5.23 no bundle do Next); stack em libs mantidas | `npm audit` executado na entrega |
| Rota de saúde + alerta se o webhook do WhatsApp parar de receber | ✅ | `api/health/route.ts`; detector de 24h silenciosas em `src/lib/jobs-worker.ts` (`runMaintenance`) notificando donos/gerentes | Revisão + health testado via curl |
| LGPD: exportação e exclusão sob demanda (soft delete + purga), consentimento no formulário | ✅ | `api/contatos/[id]/export` (auditado), `deleteContactAction` (soft delete + purga 30d no worker), `consentText` no builder do formulário | E2E das telas de contatos/formulário |

## Pendências para produção (fora do código)

1. Habilitar backup diário + PITR no provedor do Postgres e documentar um teste de restauração.
2. Definir `ENCRYPTION_KEY`, `CRON_SECRET`, `META_*` reais via secret manager do deploy (nunca no repositório).
3. Configurar Renovate/Dependabot no repositório para manter o `npm audit` verde ao longo do tempo.
