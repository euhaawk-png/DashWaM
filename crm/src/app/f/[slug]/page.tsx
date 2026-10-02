import { notFound } from "next/navigation";
import { loadPublicForm } from "@/lib/forms-public";
import { PublicForm } from "./PublicForm";

export const dynamic = "force-dynamic";

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPublicForm(slug);
  if (!data) notFound();
  const { form } = data;

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-12">
      <div className="card w-full max-w-md p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">{form.name}</h1>
        <PublicForm
          slug={form.slug}
          fields={form.fields}
          buttonLabel={form.buttonLabel}
          consentText={form.consentText}
        />
      </div>
    </div>
  );
}
