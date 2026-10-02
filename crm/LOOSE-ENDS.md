# LOOSE-ENDS — pendências do Ezo

> Este arquivo não existia na base: foi reconstruído por auditoria do código em
> 2026-10-02 e **100% fechado nesta mesma sessão**. Status: ✅ feito ·
> 🌐 DEPENDE DE EXTERNO (fora do código).

## Pendências de CÓDIGO (todas resolvidas)

| # | Item | Origem | Status |
| --- | --- | --- | --- |
| 1 | Re-poll periódico dos formulários Meta Lead Ads (recuperação além do webhook + fila) | Spec 6.6 | ✅ job `leadgen_repoll` a cada 6h com dedupe por `leadgen_id`, atrás da feature flag (`jobs-worker.ts`) |
| 2 | Responsivo do inbox em celular (lista ↔ thread alternando com botão voltar) | Spec 7 | ✅ `InboxClient.tsx` (breakpoint md) |
| 3 | Sidebar só com o símbolo no topo + tooltips quando colapsada | Manual Ezo | ✅ `Sidebar.tsx` (itens já tinham `title`) |
| 4 | Estados vazios padronizados com símbolo esmaecido + instrução + ação | Spec 7 | ✅ `EmptyState.tsx` aplicado em contatos, formulários, integrações, pipeline, relatórios (inbox já tinha CTA próprio) |
| 5 | Home pública de marketing na raiz | Nova missão | ✅ `/` estática com 6 seções; logado redireciona via middleware |
| 6 | Página /privacidade (LGPD) | LGPD | ✅ `/privacidade` |
| 7 | Custos de mensagens da Meta (regra 01/10/2026) na UI + contador de franquia | Nova missão | ✅ `wa_usage_monthly`, barra + badges 80/100%, preço editável no super admin, painel de consumo, wizard/README |
| 8 | Mídia do WhatsApp em bucket próprio | Spec 3 | ✅ decisão de v1 registrada: proxy autenticado da CDN da Meta com escopo de tenant (`/api/wa/media`); bucket fica para a v2 |
| 9 | **Bug descoberto nesta sessão**: varreduras de manutenção (purga LGPD e detector de webhook silencioso) consultavam tabelas RLS sem contexto de tenant — nunca viam linhas em produção | Auditoria | ✅ corrigido: manutenção itera tenants ativos e roda dentro do contexto de cada um (`runMaintenance`) |

## 🌐 DEPENDE DE EXTERNO (não resolve com código)

| Item | O que falta |
| --- | --- |
| Meta Tech Provider | Verificação do negócio + App Review (2 vídeos) + config do Embedded Signup; preencher META_* na Vercel |
| Permissões leads_retrieval / pages_manage_metadata | App Review; depois ligar META_LEADGEN_ENABLED=true |
| E-mail transacional | Conta Resend + SPF/DKIM no domínio; RESEND_API_KEY/EMAIL_FROM na Vercel |
| Agendador externo do worker | cron-job.org chamando `/api/jobs/run` a cada 1 min com Bearer CRON_SECRET |
| APP_URL de produção | Setar https://crm-v1-drab.vercel.app (ou domínio final) na Vercel |
| EZCALA_WHATSAPP_URL | Número real da Ezcala para o CTA da home (placeholder wa.me até lá) |
| Rodar 0002 no Supabase | Reexecutar o `supabase-setup.sql` atualizado (idempotente) no SQL Editor para criar `wa_usage_monthly`/`platform_settings` |
| Backups do banco | Habilitar backup/PITR no Supabase e ensaiar restauração |
