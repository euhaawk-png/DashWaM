// Single source of truth for branding — swap these values (and the CSS vars
// they feed in globals.css) to white-label the product.
//
// Ezo brand manual (summary):
// - Symbol: /brand/ezo-simbolo.svg (blue bolt with the Ezo "Z" cut out).
//   Never redraw, distort, rotate, or add shadow/glow/gradient to it.
// - On blue (#2563EB) backgrounds always use the white negative
//   (/brand/ezo-simbolo-branco.svg). Black mono: /brand/ezo-simbolo-preto.svg.
// - Minimum clear space around the symbol: its own width.
// - Wordmark: "Ezo" in Inter ExtraBold (800), #0A0A0A, capital E only.
// - Green/red are semantic only (won/lost, status) — never brand colors.
export const brand = {
  productName: "Ezo",
  tagline: "Chegou lead, virou venda",
  // Accent colors as "R G B" (feed the CSS variables in globals.css).
  accentRgb: "37 99 235", // #2563EB
  accentHoverRgb: "29 78 216", // #1D4ED8
  accentSoftRgb: "239 246 255", // #EFF6FF
  symbolUrl: "/brand/ezo-simbolo.svg",
  symbolWhiteUrl: "/brand/ezo-simbolo-branco.svg",
  symbolBlackUrl: "/brand/ezo-simbolo-preto.svg",
  logoHorizontalUrl: "/brand/ezo-logo-horizontal.svg",
};
