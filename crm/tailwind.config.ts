import type { Config } from "tailwindcss";

// All theme colors resolve to CSS variables declared in globals.css, which in
// turn read from src/config/brand.ts — single place to rebrand / white-label.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
        ink: "#0A0A0A",
        paper: "#FFFFFF",
        line: "#E5E7EB",
        muted: "#6B7280",
        ok: "#16A34A",
        danger: "#DC2626",
        warn: "#D97706",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
