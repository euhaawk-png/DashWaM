import { colors } from '../theme/tokens';
import type { Plataforma } from '../types';

/** Tag colorida por canal (Google em vermelho, LinkedIn em azul de apoio) */
export function ChannelTag({ plataforma }: { plataforma: Plataforma }) {
  const cor = plataforma === 'Google' ? colors.accent : colors.support;
  return (
    <span
      className="inline-block rounded-tag px-2 py-0.5 text-xs font-semibold"
      style={{ color: cor, backgroundColor: cor + '14' }}
    >
      {plataforma}
    </span>
  );
}
