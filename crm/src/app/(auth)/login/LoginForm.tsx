"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type ActionState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>Entrar</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/esqueci-senha" className="text-accent hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
