import { notFound } from "next/navigation";
import { loadPublicForm } from "@/lib/forms-public";
import { PublicForm } from "../PublicForm";

export const dynamic = "force-dynamic";

/** Frameable variant for <iframe> embeds (frame-ancestors relaxed in next.config). */
export default async function EmbedFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPublicForm(slug);
  if (!data) notFound();
  const { form } = data;

  return (
    <div className="bg-paper p-4">
      <PublicForm
        slug={form.slug}
        fields={form.fields}
        buttonLabel={form.buttonLabel}
        consentText={form.consentText}
      />
    </div>
  );
}
