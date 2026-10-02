"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type ActionState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

export function ForgotForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(forgotPasswordAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      {state.error && (
        <p className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>{state.error}</p>
      )}
      <SubmitButton>Enviar link</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login" className="text-accent hover:underline">Voltar ao login</Link>
      </p>
    </form>
  );
}
