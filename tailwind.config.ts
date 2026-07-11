import type { Config } from 'tailwindcss';
import { colors } from './src/theme/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wam: {
          bg: colors.background,
          surface: colors.surface,
          'surface-soft': colors.surfaceSoft,
          accent: colors.accent,
          ink: colors.textPrimary,
          muted: colors.textSecondary,
          border: colors.border,
          support: colors.support,
          good: colors.deltaGood,
          bad: colors.deltaBad,
        },
      },
      fontFamily: {
        heading: ['Montserrat', 'sans-serif'],
        body: ['"Open Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        tag: '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(36, 36, 36, 0.05)',
      },
    },
  },
  plugins: [],
} satisfies Config;
