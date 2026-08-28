"use client";

import { useActionState } from "react";
import { verifyTotpAction, type ActionState } from "../../actions";
import { SubmitButton } from "@/components/SubmitButton";

export function TotpForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(verifyTotpAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <input
        name="code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        placeholder="000000"
        className="input text-center text-xl tracking-[0.5em]"
      />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>Verificar</SubmitButton>
    </form>
  );
}
