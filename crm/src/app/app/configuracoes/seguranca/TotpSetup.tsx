"use client";

import { useActionState, useState } from "react";
import { beginTotpSetupAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

type State = { error?: string; ok?: boolean; message?: string };

export function TotpSetup({
  confirmAction,
}: {
  confirmAction: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [state, formAction] = useActionState<State, FormData>(confirmAction, {});

  if (!setup) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">
          Use um aplicativo autenticador (Google Authenticator, Authy, 1Password) para gerar códigos.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => setSetup(await beginTotpSetupAction())}
        >
          Ativar 2FA
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p>1. Adicione esta chave no seu aplicativo autenticador:</p>
      <code className="block break-all rounded-md bg-gray-100 px-3 py-2 font-mono text-xs">{setup.secret}</code>
      <p className="text-xs text-muted">
        Ou copie o link de configuração: <code className="break-all">{setup.uri}</code>
      </p>
      <p>2. Digite o código de 6 dígitos gerado para confirmar:</p>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="secret" value={setup.secret} />
        <input
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          placeholder="000000"
          className="input w-32 text-center tracking-widest"
        />
        <SubmitButton className="btn-primary">Confirmar</SubmitButton>
      </form>
      {state.error && <p className="text-danger">{state.error}</p>}
      {state.ok && <p className="text-ok">{state.message}</p>}
    </div>
  );
}
