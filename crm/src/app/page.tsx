import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const auth = await getSession();
  if (!auth) redirect("/login");
  if (auth.session.totpPending) redirect("/login/2fa");
  if (auth.session.activeTenantId) redirect("/app/inbox");
  redirect("/selecionar-empresa");
}
