"use client";

import { useActionState } from "react";
import { acceptInviteAction, type ActionState } from "../../actions";
import { SubmitButton } from "@/components/SubmitButton";

export function InviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(acceptInviteAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="name">Seu nome</label>
        <input id="name" name="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
        <p className="mt-1 text-xs text-muted">Mínimo de 10 caracteres, com maiúsculas, minúsculas e números.</p>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>Criar conta e entrar</SubmitButton>
    </form>
  );
}
