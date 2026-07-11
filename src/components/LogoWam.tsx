import { colors } from '../theme/tokens';

/**
 * Monograma da WaM (W, A e M entrelaçados) recriado em vetor
 * a partir do logo oficial. Cor controlada pelos tokens.
 */
export function LogoWam({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1200 1200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Logo da WaM"
    >
      <defs>
        <clipPath id="wam-frame">
          <rect x="80" y="180" width="1040" height="850" />
        </clipPath>
      </defs>
      <g clipPath="url(#wam-frame)">
        <g fill="none" stroke={colors.accent} strokeWidth="135" strokeLinejoin="miter" strokeMiterlimit="2">
          <polyline points="245,140 405,640 550,310 705,680 767,140" />
          <polyline points="510,1080 672,600 790,930 908,600 1020,1080" strokeMiterlimit="1.2" />
        </g>
        <polygon
          points="864,295 784,515 944,515"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="95"
          strokeLinejoin="miter"
          strokeMiterlimit="8"
        />
        <polygon points="864,295 784,515 944,515" fill={colors.accent} />
        <polygon points="864,420 828,515 900,515" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
