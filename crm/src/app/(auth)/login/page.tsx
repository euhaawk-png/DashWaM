import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const params = await searchParams;
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Entrar</h1>
      {params.reset && (
        <p className="mb-4 rounded-md bg-ok/10 px-3 py-2 text-sm text-ok">
          Senha redefinida com sucesso. Entre com a nova senha.
        </p>
      )}
      <LoginForm />
    </div>
  );
}
