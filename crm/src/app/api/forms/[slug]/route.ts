import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { formSubmissions, notifications, whatsappAccounts } from "@/db/schema";
import { loadPublicForm } from "@/lib/forms-public";
import { createLead, ensureContact } from "@/lib/leads";
import { normalizePhone } from "@/lib/phone";
import { ipFrom, rateLimit } from "@/lib/rate-limit";

const submitSchema = z.object({
  data: z.record(z.string().max(2000)).refine((d) => Object.keys(d).length <= 30),
  utm: z.record(z.string().max(500)).optional().default({}),
});

/** Public form submission: creates contact + deal and runs lead routing. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = ipFrom(req);
  if (!(await rateLimit(`form:${slug}:${ip}`, 10, 300)) || !(await rateLimit(`form:ip:${ip}`, 30, 3600))) {
    return NextResponse.json({ error: "Muitos envios. Tente novamente em alguns minutos." }, { status: 429 });
  }

  const loaded = await loadPublicForm(slug);
  if (!loaded) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  const { form, tenantId } = loaded;

  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const { data, utm } = parsed.data;

  // Honeypot: silently accept and drop.
  if (data.website) {
    return NextResponse.json({ ok: true, message: form.successMessage, waLink: null, submissionId: "" });
  }

  // Validate required fields + phone format.
  let phone: string | null = null;
  let email: string | null = null;
  let name: string | null = null;
  for (const field of form.fields) {
    const value = (data[field.key] ?? "").trim();
    if (field.required && !value) {
      return NextResponse.json({ error: `Preencha o campo "${field.label}".` }, { status: 400 });
    }
    if (!value) continue;
    if (field.type === "phone") {
      phone = normalizePhone(value);
      if (!phone) {
        return NextResponse.json(
          { error: `Telefone inválido em "${field.label}". Use DDD + número.` },
          { status: 400 }
        );
      }
    } else if (field.type === "email") {
      if (!z.string().email().safeParse(value).success) {
        return NextResponse.json({ error: `E-mail inválido em "${field.label}".` }, { status: 400 });
      }
      email = value.toLowerCase();
    } else if (!name) {
      name = value;
    }
  }

  const source = `form:${form.name}`;
  const result = await withTenant(tenantId, async (tx) => {
    const contact = await ensureContact(tx, tenantId, {
      phone,
      name,
      email,
      source,
      extra: { lastFormPayload: data },
    });
    const { deal } = await createLead(tx, tenantId, {
      contact,
      source,
      utm,
      pipelineId: form.pipelineId,
      stageId: form.stageId,
      distribute: form.distribute,
      reuseOpen: false,
    });
    // The seller picked by routing gets an in-app notification.
    if (deal.ownerId) {
      await tx.insert(notifications).values({
        tenantId,
        userId: deal.ownerId,
        type: "new_lead",
        title: "Novo lead recebido",
        body: `${contact.name ?? contact.phone ?? "Lead"} — ${source}`,
        link: `/app/pipeline/negociacao/${deal.id}`,
      });
    }
    const [submission] = await tx
      .insert(formSubmissions)
      .values({ tenantId, formId: form.id, payload: data, utm, contactId: contact.id, dealId: deal.id })
      .returning();
    const account = (
      await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, tenantId)).limit(1)
    )[0];
    return { submission, companyPhone: account?.displayPhone ?? null };
  });

  let waLink: string | null = null;
  if (form.showWhatsappCta && phone && result.companyPhone) {
    const digits = result.companyPhone.replace(/\D/g, "");
    const text = encodeURIComponent(`Olá! Acabei de preencher o formulário "${form.name}" e quero ser atendido.`);
    waLink = `https://wa.me/${digits}?text=${text}`;
  }

  return NextResponse.json({
    ok: true,
    message: form.successMessage,
    waLink,
    submissionId: result.submission.id,
  });
}
