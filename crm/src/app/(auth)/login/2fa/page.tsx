import { TotpForm } from "./TotpForm";

export const metadata = { title: "Verificação em duas etapas" };

export default function TwoFactorPage() {
  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Verificação em duas etapas</h1>
      <p className="mb-4 text-sm text-muted">
        Digite o código de 6 dígitos do seu aplicativo autenticador.
      </p>
      <TotpForm />
    </div>
  );
}
