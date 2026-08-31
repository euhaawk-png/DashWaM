# Ezo — SaaS multi-tenant de atendimento comercial via WhatsApp

> **Marca**: os assets oficiais vivem em `public/brand/` (símbolo azul #2563EB, mono preto,
> negativa branca, logo horizontal e ícones). Regras do manual: nunca redesenhar, distorcer,
> girar ou aplicar sombra/brilho/gradiente ao símbolo; sobre azul, usar sempre a negativa
> branca; respiro mínimo ao redor igual à largura do símbolo. Tokens de cor/tipografia
> centralizados em `src/config/brand.ts` + `globals.css` (rebrand em um lugar só).

CRM estilo Kommo/RD Station focado em atendimento via **WhatsApp Cloud API oficial da Meta**
(sem QR code / engenharia reversa). Multi-tenant real desde o commit 1, com isolamento por
Row-Level Security do PostgreSQL. Interface em pt-BR; código em inglês.

## Stack

- **Next.js 15** (App Router, TypeScript) — frontend + backend no mesmo app
- **PostgreSQL** (Supabase/Neon/RDS) + **Drizzle ORM** (migrações SQL manuais em `drizzle/`)
- **RLS nativo** com `FORCE ROW LEVEL SECURITY` em todas as tabelas de tenant
- Tempo real do inbox via **SSE** (polling server-side, sem dependência externa)
- Fila de jobs em Postgres (`jobs` + worker em `/api/jobs/run`, cron a cada minuto)
- E-mail transacional via Resend (fallback: log no console em dev)

## Como rodar

```bash
cd crm
npm install
cp .env.example .env        # preencha DATABASE_URL, DATABASE_ADMIN_URL, ENCRYPTION_KEY, CRON_SECRET
npm run db:migrate          # aplica drizzle/*.sql (usa DATABASE_ADMIN_URL)
npm run db:seed             # admin da plataforma + tenant demo com 3 papéis
npm run dev
```

Usuários do seed (senha `Trocar-esta-senha-123`, ou defina `SEED_PASSWORD`):
`admin@plataforma.local` (super admin → /admin), `dono@demo.local`, `gerente@demo.local`,
`vendedor@demo.local`.

### Variáveis de ambiente

| Variável | Localhost | Produção | Para quê |
| --- | --- | --- | --- |
| `DATABASE_URL` | obrigatória | obrigatória | Conexão da aplicação (papel `crm_app`, sem BYPASSRLS) |
| `DATABASE_ADMIN_URL` | obrigatória | obrigatória (só CI/deploy) | Migrações e seed (owner do schema) |
| `APP_URL` | obrigatória | obrigatória | Links de e-mail, URLs públicas, checagem de origin |
| `ENCRYPTION_KEY` | obrigatória | obrigatória | AES-256-GCM dos tokens Meta e chaves de webhook |
| `CRON_SECRET` | obrigatória | obrigatória | Protege `/api/jobs/run` |
| `META_APP_ID` / `META_APP_SECRET` | opcionais (WhatsApp desativado sem elas) | obrigatórias | Embedded Signup + assinatura dos webhooks |
| `META_ES_CONFIG_ID` | opcional | obrigatória | Config do Embedded Signup v4 |
| `META_WEBHOOK_VERIFY_TOKEN` | opcional | obrigatória | Handshake GET dos webhooks da Meta |
| `META_GRAPH_VERSION` | opcional (padrão v23.0) | opcional | Versão da Graph API |
| `META_LEADGEN_ENABLED` | opcional (padrão false) | opcional | Feature flag do conector Meta Lead Ads |
| `RESEND_API_KEY` / `EMAIL_FROM` | opcionais (e-mails vão para o console) | obrigatórias | E-mail transacional |
| `SEED_PASSWORD` | opcional | não usar seed em produção | Senha dos usuários do seed |

> **Importante:** `DATABASE_URL` deve apontar para o papel `crm_app` (criado pela migração
> `0001_rls.sql`, **sem** BYPASSRLS). Defina a senha dele: `ALTER ROLE crm_app PASSWORD '...'`.
> `DATABASE_ADMIN_URL` (owner do schema) é usada só por migração/seed.

### Teste de isolamento multi-tenant (critério de aceite da Fase 1)

```bash
npm run test:rls
```

Prova que tenant B não lê/edita/exclui dados do tenant A (listagem, fetch-by-id, escrita
cruzada), que sem contexto de tenant nenhuma linha aparece, e que o audit log é append-only.

## Arquitetura de isolamento

- Toda tabela de negócio tem `tenant_id` + política `USING/WITH CHECK
  (tenant_id = current_setting('app.current_tenant_id')::uuid)`, com `FORCE ROW LEVEL SECURITY`.
- O único caminho sancionado para tocar dados de tenant é `withTenant(tenantId, fn)`
  (`src/db/index.ts`), que abre uma transação e seta `app.current_tenant_id`. Uma query
  esquecida fora do contexto retorna **zero linhas** — nunca dados de outra empresa.
- Entradas públicas (webhook do WhatsApp, formulários `/f/{slug}`, hooks `/api/hooks/...`)
  resolvem o tenant por índices globais mínimos (`public_endpoints`) e então abrem o contexto.
- Super admin (`/admin`) usa um contexto próprio que enxerga apenas **metadados** da conexão
  WhatsApp — nunca conversas, contatos ou negociações.

## Módulos

| Módulo | Onde |
| --- | --- |
| Auth (login, reset, convites, 2FA TOTP, sessões) | `src/app/(auth)`, `src/lib/auth` |
| Conexão WhatsApp (Embedded Signup v4, status, templates) | `/app/configuracoes/whatsapp` |
| Webhook Cloud API (assinatura X-Hub-Signature-256) | `/api/wa/webhook` |
| Inbox 3 colunas, tempo real, janela 24h, notas internas | `/app/inbox` |
| Pipeline kanban + negociação + timeline | `/app/pipeline` |
| Contatos + LGPD (exportar/excluir) | `/app/contatos` |
| Formulário nativo (link, embed, wa.me, UTMs, honeypot) | `/app/formularios`, `/f/{slug}` |
| Central de webhooks (Google Ads, WordPress/genérico, Meta leadgen*) | `/app/integracoes`, `/api/hooks` |
| Distribuição (roleta/fixo/fila) + alerta de demora | `/app/configuracoes/distribuicao` |
| Relatórios (4 relatórios + CSV auditado) | `/app/relatorios` |
| Onboarding wizard | `/app/onboarding` |
| Worker de jobs + manutenção | `/api/jobs/run` (cron: `vercel.json`) |
| Health check | `/api/health` |

\* Meta Lead Ads fica atrás da flag `META_LEADGEN_ENABLED` até a aprovação de
`leads_retrieval` no App Review.

## Deploy (Vercel + Supabase)

0. **Banco (Supabase)**: cole o conteúdo de [`supabase-setup.sql`](./supabase-setup.sql) no
   SQL Editor e execute — ele aplica schema + RLS, cria o papel `crm_app` com senha, registra
   as migrações e roda o seed. É idempotente. A `DATABASE_URL` de produção autentica como
   `crm_app.<project-ref>` no transaction pooler (porta 6543).
1. Importe o repositório com **Root Directory = `crm`**.
2. Configure as variáveis do `.env.example` (produção: `APP_URL` público HTTPS).
3. O cron de `vercel.json` chama `/api/jobs/run` 1x/dia (limite do plano Hobby).
   **Sem Vercel Pro**, configure um agendador externo gratuito (ex.: cron-job.org)
   chamando `GET https://<url-do-app>/api/jobs/run` a cada 1 minuto com o header
   `Authorization: Bearer <CRON_SECRET>` — é isso que dá tempo real a boas-vindas,
   alertas de demora e retentativas de webhook.
4. Webhook da Meta: URL `https://SEU_DOMINIO/api/wa/webhook`, verify token =
   `META_WEBHOOK_VERIFY_TOKEN`, campos `messages` e `message_template_status_update`
   (e `leadgen` no webhook de Página, quando habilitado).

## Checklist de segurança (seção 9 do escopo)

**Isolamento e acesso**
- [x] RLS + `FORCE` em todas as tabelas de tenant, políticas USING/WITH CHECK (`drizzle/0001_rls.sql`)
- [x] Contexto de tenant único por request (`withTenant`); fetch-by-id sempre filtrado por RLS
- [x] Autorização por papel no servidor em toda rota/ação (`guard.ts`: requireRole/apiTenantCtx)
- [x] Listagens paginadas e escopadas (contatos, conversas, eventos, logs)

**Credenciais e dados sensíveis**
- [x] Tokens Meta e chaves de webhook com AES-256-GCM (`ENCRYPTION_KEY`), nunca em texto puro/logs
- [x] Secrets somente em env; `.env` no gitignore
- [x] Senhas bcrypt (custo 12); tokens de reset/convite hasheados (SHA-256) com expiração

**Superfície pública**
- [x] `X-Hub-Signature-256` validada em todo POST da Meta (401 + log quando inválida)
- [x] `google_key` validada no conector Google Ads; `X-Api-Key`/HMAC nos genéricos (comparação constant-time)
- [x] Rate limiting em login, reset, formulários e webhooks (por IP e por recurso, bloqueio progressivo)
- [x] Validação com zod em todo input; mensagens renderizadas como texto (React escapa; nunca HTML)
- [x] Mídia servida por rota autenticada com escopo de tenant (`/api/wa/media/...`), sem caminho previsível
- [x] CSP estrita, HSTS, X-Content-Type-Options, frame-ancestors (iframe liberado só em `/f/{slug}/embed`)
- [x] CSRF: server actions com verificação de origin do Next + checagem de origin nas rotas de mutação; cookies SameSite=Lax

**Operação**
- [x] Audit log append-only (RLS sem UPDATE/DELETE + REVOKE), com login, exportação, permissões, edições
- [x] Logs sem PII desnecessária (helper `maskPhone`; telefones não são logados)
- [ ] Backups diários: habilitar no provedor gerenciado (Supabase/Neon/RDS) e documentar teste de restauração
- [x] `npm audit` limpo no lock atual; renovar dependências via Renovate/Dependabot
- [x] `/api/health` + alerta de webhook silencioso (24h sem eventos → notifica donos/gerentes)
- [x] LGPD: exportação JSON e exclusão (soft delete + purga em 30 dias) por contato; termo de
      consentimento configurável no formulário

## Pré-requisitos externos (fora do código)

Ver seção 12 do escopo: Business Portfolio verificado na Meta, app com produto WhatsApp e
cadastro de Tech Provider (App Review com 2 vídeos), limite inicial de 10 onboardings/7 dias
no Embedded Signup, permissões `leads_retrieval`/`pages_manage_metadata` para o conector de
Lead Ads, domínio + e-mail transacional com SPF/DKIM. Durante o desenvolvimento use o número
de teste da Cloud API.
