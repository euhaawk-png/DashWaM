"use client";

import { useActionState } from "react";
import { SubmitButton } from "./SubmitButton";

type State = { error?: string; ok?: boolean; message?: string };

/** Generic wrapper: server-rendered fields + action state feedback. */
export function ActionForm({
  action,
  submitLabel,
  className = "space-y-4",
  children,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<State, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && state.message && <p className="break-all text-sm text-ok">{state.message}</p>}
      <SubmitButton className="btn-primary">{submitLabel}</SubmitButton>
    </form>
  );
}
