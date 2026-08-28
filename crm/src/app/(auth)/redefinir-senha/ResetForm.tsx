"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ActionState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(resetPasswordAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">Nova senha</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
        <p className="mt-1 text-xs text-muted">Mínimo de 10 caracteres, com maiúsculas, minúsculas e números.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirmar senha</label>
        <input id="confirm" name="confirm" type="password" required className="input" />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>Salvar nova senha</SubmitButton>
    </form>
  );
}
