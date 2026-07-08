import type { Config } from "tailwindcss";

/**
 * OUTSIDE design tokens.
 * Premium dark intelligence platform: near-black layered surfaces, restrained
 * accent, high-contrast type. Accent is a cold signal-cyan; risk uses amber/red
 * sparingly so emphasis stays meaningful.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#05070a",
          900: "#080b11",
          850: "#0b0f17",
          800: "#0f1420",
          700: "#161c2b",
          600: "#1e2637",
        },
        line: {
          DEFAULT: "rgba(148, 173, 214, 0.10)",
          strong: "rgba(148, 173, 214, 0.18)",
        },
        ink: {
          DEFAULT: "#e8edf6",
          soft: "#aab6cc",
          faint: "#6b7793",
        },
        signal: {
          DEFAULT: "#38e1c3",
          bright: "#5ff5da",
          dim: "#1f7d6e",
        },
        accent: {
          DEFAULT: "#5b8cff",
          dim: "#2f4f9e",
        },
        risk: {
          low: "#5ff5da",
          medium: "#f5c451",
          high: "#ff8a5b",
          critical: "#ff5b6e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 60px -30px rgba(0,0,0,0.9)",
        glow: "0 0 40px -8px rgba(56, 225, 195, 0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
