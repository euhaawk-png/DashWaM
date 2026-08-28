"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormActionState } from "./actions";

type Field = { key: string; label: string; type: "text" | "email" | "phone" | "textarea"; required: boolean };

const DEFAULT_FIELDS: Field[] = [
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "phone", label: "Telefone (WhatsApp)", type: "phone", required: true },
  { key: "email", label: "E-mail", type: "email", required: false },
];

export function FormBuilder({
  action,
  initial,
}: {
  action: (prev: FormActionState, formData: FormData) => Promise<FormActionState>;
  initial?: {
    formId: string;
    name: string;
    fields: Field[];
    buttonLabel: string;
    successMessage: string;
    showWhatsappCta: boolean;
    consentText: string | null;
    distribute: boolean;
    active: boolean;
  };
}) {
  const [state, formAction] = useActionState<FormActionState, FormData>(action, {});
  const [fields, setFields] = useState<Field[]>(initial?.fields ?? DEFAULT_FIELDS);

  const updateField = (i: number, patch: Partial<Field>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <form action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="formId" value={initial.formId} />}
      <input type="hidden" name="fieldsJson" value={JSON.stringify(fields)} />
      <div>
        <label className="label">Nome do formulário</label>
        <input name="name" required defaultValue={initial?.name} className="input" placeholder="Ex.: Contato do site" />
      </div>

      <div>
        <label className="label">Campos</label>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2">
              <input
                value={f.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                className="input min-w-40 flex-1 py-1 text-sm"
                placeholder="Rótulo"
              />
              <select
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as Field["type"] })}
                className="input w-32 py-1 text-sm"
              >
                <option value="text">Texto</option>
                <option value="phone">Telefone</option>
                <option value="email">E-mail</option>
                <option value="textarea">Texto longo</option>
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                />
                Obrigatório
              </label>
              <button
                type="button"
                onClick={() => setFields((fs) => fs.filter((_, idx) => idx !== i))}
                className="text-xs text-danger hover:underline"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-2 py-1 text-xs"
          onClick={() =>
            setFields((fs) => [
              ...fs,
              { key: `campo_${fs.length + 1}`, label: `Campo ${fs.length + 1}`, type: "text", required: false },
            ])
          }
        >
          + Adicionar campo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Texto do botão</label>
          <input name="buttonLabel" defaultValue={initial?.buttonLabel ?? "Quero ser atendido"} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Mensagem de sucesso</label>
        <textarea
          name="successMessage"
          rows={2}
          defaultValue={initial?.successMessage ?? "Recebemos seus dados. Em breve entraremos em contato!"}
          className="input"
        />
      </div>
      <div>
        <label className="label">Termo de consentimento (LGPD, opcional)</label>
        <textarea
          name="consentText"
          rows={2}
          defaultValue={initial?.consentText ?? ""}
          placeholder="Ex.: Autorizo o contato da empresa pelos dados informados."
          className="input"
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="showWhatsappCta" defaultChecked={initial?.showWhatsappCta ?? true} />
          Mostrar botão &quot;Chamar no WhatsApp&quot; após o envio
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="distribute" defaultChecked={initial?.distribute ?? true} />
          Distribuir leads automaticamente
        </label>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton className="btn-primary">{initial ? "Salvar alterações" : "Criar formulário"}</SubmitButton>
    </form>
  );
}
