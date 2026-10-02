"use client";

import { useActionState } from "react";
import { createTenantAction, type AdminActionState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function CreateTenantForm() {
  const [state, formAction] = useActionState<AdminActionState, FormData>(createTenantAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <label className="label" htmlFor="name">Nome da empresa</label>
        <input id="name" name="name" required className="input" />
      </div>
      <div className="min-w-56 flex-1">
        <label className="label" htmlFor="ownerEmail">E-mail do dono</label>
        <input id="ownerEmail" name="ownerEmail" type="email" required className="input" />
      </div>
      <SubmitButton className="btn-primary">Criar e convidar</SubmitButton>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <p className="w-full text-sm text-ok">
          Empresa criada. Convite enviado por e-mail.
          {state.inviteUrl && (
            <>
              {" "}Link direto: <code className="break-all rounded bg-gray-100 px-1 text-xs">{state.inviteUrl}</code>
            </>
          )}
        </p>
      )}
    </form>
  );
}
