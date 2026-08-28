"use client";

import { useState } from "react";

type Field = { key: string; label: string; type: string; required: boolean };

export function PublicForm({
  slug,
  fields,
  buttonLabel,
  consentText,
}: {
  slug: string;
  fields: Field[];
  buttonLabel: string;
  consentText: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; waLink: string | null; submissionId: string } | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const formEl = e.currentTarget;
    const data = Object.fromEntries(new FormData(formEl).entries());
    // Capture UTMs from the page URL (works inside the embed too).
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]) {
      const v = params.get(k);
      if (v) utm[k] = v;
    }
    try {
      const res = await fetch(`/api/forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, utm }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Não foi possível enviar. Tente novamente.");
      setSuccess(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">✅</div>
        <p className="mb-4 whitespace-pre-wrap text-sm">{success.message}</p>
        {success.waLink && (
          <a
            href={success.waLink}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              void fetch(`/api/forms/${slug}/wa-click`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ submissionId: success.submissionId }),
              });
            }}
            className="btn inline-flex bg-[#25D366] text-white hover:opacity-90"
          >
            Chamar no WhatsApp agora
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Honeypot: bots fill it, humans never see it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {fields.map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={`f-${f.key}`}>
            {f.label}
            {f.required && <span className="text-danger"> *</span>}
          </label>
          {f.type === "textarea" ? (
            <textarea id={`f-${f.key}`} name={f.key} required={f.required} rows={3} className="input" />
          ) : (
            <input
              id={`f-${f.key}`}
              name={f.key}
              type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
              required={f.required}
              placeholder={f.type === "phone" ? "(11) 99999-8888" : undefined}
              className="input"
            />
          )}
        </div>
      ))}
      {consentText && (
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" name="_consent" required className="mt-0.5" />
          {consentText}
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Enviando…" : buttonLabel}
      </button>
    </form>
  );
}
