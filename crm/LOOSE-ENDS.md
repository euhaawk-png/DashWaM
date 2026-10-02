# LOOSE-ENDS — pendências do Ezo

> Este arquivo não existia na base: foi reconstruído por auditoria do código em
> 2026-10-02 e preenchido nesta sessão. Status: ✅ feito nesta sessão ·
> ☐ em execução · 🌐 DEPENDE DE EXTERNO (fora do código).

## Pendências de CÓDIGO herdadas das missões anteriores

| # | Item | Origem | Status |
| --- | --- | --- | --- |
| 1 | Re-poll periódico dos formulários Meta Lead Ads (rotina de recuperação além do webhook + fila) | Spec 6.6 | ☐ nesta sessão (BLOCO 2/flag) |
| 2 | Responsivo do inbox em celular (lista ↔ thread alternando; só o painel do lead era responsivo) | Spec 7 | ☐ nesta sessão (BLOCO 3) |
| 3 | Tooltips nos itens da sidebar colapsada + topo só com o símbolo | Manual Ezo | ☐ nesta sessão (BLOCO 3) |
| 4 | Estados vazios padronizados com ilustração + ação em todas as telas (alguns eram só texto) | Spec 7 | ☐ nesta sessão (BLOCO 3) |
| 5 | Home pública de marketing na raiz (hoje `/` só redireciona) | Nova missão | ☐ nesta sessão (BLOCO 1) |
| 6 | Página /privacidade (link citado no rodapé do formulário público não existia) | LGPD | ☐ nesta sessão (BLOCO 1) |
| 7 | Custos de mensagens da Meta (regra 01/10/2026) na UI + contador de franquia | Nova missão | ☐ nesta sessão (BLOCO 2) |
| 8 | Mídia do WhatsApp em bucket próprio (hoje: proxy autenticado da CDN da Meta, decisão de v1) | Spec 3 | ☐ decisão mantida p/ v1 — registrar |

## DEPENDE DE EXTERNO (não resolve com código)

| Item | O que falta |
| --- | --- |
| Meta Tech Provider | Verificação do negócio + App Review (2 vídeos) + config do Embedded Signup; preencher META_* na Vercel |
| Permissões leads_retrieval / pages_manage_metadata | App Review; depois ligar META_LEADGEN_ENABLED=true |
| E-mail transacional | Conta Resend + SPF/DKIM no domínio; RESEND_API_KEY/EMAIL_FROM na Vercel |
| Agendador externo do worker | cron-job.org chamando /api/jobs/run a cada 1 min com Bearer CRON_SECRET |
| APP_URL de produção | Setar https://crm-v1-drab.vercel.app (ou domínio final) na Vercel |
| EZCALA_WHATSAPP_URL | Número real da Ezcala para o CTA da home (placeholder até lá) |
| Backups do banco | Habilitar backup/PITR no Supabase e ensaiar restauração |
