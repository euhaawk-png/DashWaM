import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { contacts, conversations, messages, waTemplates, whatsappAccounts } from "@/db/schema";
import { apiTenantCtx, sameOrigin } from "@/lib/auth/guard";
import { getAccessibleConversation, windowState } from "@/lib/inbox";
import { sendTemplateMessage, sendTextMessage, WaApiError } from "@/lib/whatsapp/client";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  // one of:
  text: z.string().min(1).max(4096).optional(),
  templateId: z.string().uuid().optional(),
  note: z.string().min(1).max(4096).optional(),
});

/** Sends a message in a conversation: free text inside the 24h window,
 *  approved template outside it, or an internal note (never sent to Meta). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const { conversationId, text, templateId, note } = parsed.data;
  if (!text && !templateId && !note) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const result = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const conversation = await getAccessibleConversation(tx, ctx, conversationId);
      if (!conversation) return { status: 404 as const, error: "Conversa não encontrada." };

      // Internal note: stored only, visible to the team.
      if (note) {
        await tx.insert(messages).values({
          tenantId: ctx.tenant.id,
          conversationId,
          direction: "out",
          type: "note",
          body: note,
          isInternalNote: true,
          status: "sent",
          authorId: ctx.user.id,
        });
        return { status: 200 as const };
      }

      const contact = (
        await tx.select().from(contacts).where(eq(contacts.id, conversation.contactId)).limit(1)
      )[0];
      if (!contact?.phone) return { status: 400 as const, error: "Contato sem telefone." };
      const account = (
        await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
      )[0];
      if (!account || account.status !== "connected") {
        return { status: 400 as const, error: "WhatsApp não conectado. Conecte em Configurações." };
      }

      const win = windowState(conversation.lastInboundAt);

      let waMessageId: string | null = null;
      let storedBody: string;
      let storedType = "text";
      try {
        if (templateId) {
          const template = (
            await tx
              .select()
              .from(waTemplates)
              .where(and(eq(waTemplates.tenantId, ctx.tenant.id), eq(waTemplates.id, templateId)))
              .limit(1)
          )[0];
          if (!template) return { status: 404 as const, error: "Template não encontrado." };
          if (template.status !== "APPROVED") {
            return { status: 400 as const, error: "Este template ainda não foi aprovado pela Meta." };
          }
          const res = await sendTemplateMessage(account, contact.phone, template.name, template.language);
          waMessageId = res.messages?.[0]?.id ?? null;
          storedBody = template.body;
          storedType = "template";
        } else {
          if (!win.open) {
            return {
              status: 409 as const,
              error: "A janela de 24h expirou. Use um template aprovado para retomar a conversa.",
            };
          }
          const res = await sendTextMessage(account, contact.phone, text!);
          waMessageId = res.messages?.[0]?.id ?? null;
          storedBody = text!;
        }
      } catch (err) {
        const detail = err instanceof WaApiError ? JSON.stringify(err.detail).slice(0, 300) : String(err);
        console.error("[inbox/send] WA send failed", detail);
        return { status: 502 as const, error: "Falha ao enviar pelo WhatsApp. Tente novamente." };
      }

      const [message] = await tx
        .insert(messages)
        .values({
          tenantId: ctx.tenant.id,
          conversationId,
          direction: "out",
          type: storedType,
          body: storedBody,
          waMessageId,
          status: "sent",
          authorId: ctx.user.id,
        })
        .returning();

      await tx
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: storedBody.slice(0, 120),
          ...(conversation.firstResponseAt ? {} : { firstResponseAt: new Date() }),
          ...(conversation.status === "closed" ? { status: "open" as const } : {}),
        })
        .where(eq(conversations.id, conversationId));

      return { status: 200 as const, message };
    },
    { userId: ctx.user.id }
  );

  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
