/** Aviso neutro para estados vazios ou filtros que escondem a página */
export function Aviso({ texto }: { texto: string }) {
  return (
    <div className="rounded-card border border-wam-border bg-wam-surface-soft p-6 text-center text-sm text-wam-muted">
      {texto}
    </div>
  );
}
