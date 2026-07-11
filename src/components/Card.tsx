import type { ReactNode } from 'react';

/** Card de seção com título, sobre fundo alternado */
export function SecaoCard({
  titulo,
  children,
  tom = 'soft',
  className = '',
}: {
  titulo?: string;
  children: ReactNode;
  /** soft = #F9F9F9 · alt = #F5F5F5 */
  tom?: 'soft' | 'alt';
  className?: string;
}) {
  const fundo = tom === 'alt' ? 'bg-wam-surface' : 'bg-wam-surface-soft';
  return (
    <section className={`rounded-card border border-wam-border ${fundo} p-4 shadow-card sm:p-5 ${className}`}>
      {titulo && (
        <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-wide text-wam-ink">
          {titulo}
        </h2>
      )}
      {children}
    </section>
  );
}
