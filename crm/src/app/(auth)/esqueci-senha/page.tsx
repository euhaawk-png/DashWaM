import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Esqueci minha senha</h1>
      <p className="mb-4 text-sm text-muted">
        Informe seu e-mail e enviaremos um link para redefinir a senha.
      </p>
      <ForgotForm />
    </div>
  );
}
