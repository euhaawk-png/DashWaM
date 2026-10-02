import { ResetForm } from "./ResetForm";

export const metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return <p className="text-sm text-danger">Link inválido. Solicite uma nova redefinição.</p>;
  }
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Criar nova senha</h1>
      <ResetForm token={token} />
    </div>
  );
}
