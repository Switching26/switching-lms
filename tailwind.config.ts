import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
        },
        accent: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
        },
        ink: {
          DEFAULT: "#111827",
          70:      "#374151",
          50:      "#6B7280",
          30:      "#9CA3AF",
          10:      "#E5E7EB",
        },
        primary: "#4F46E5",
        background: "#FFFFFF",
        muted: "#F9FAFB",
        border: "#E5E7EB",
        warm: {
          50: "#faf8f5",
          100: "#f3efe8",
          200: "#e8e2d8",
          300: "#d4cbc0",
          400: "#b5a898",
          500: "#9a8b78",
          600: "#7d6e5e",
          700: "#655a4d",
          800: "#554c42",
          900: "#49423a",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card:       "0 1px 3px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.04)",
        "card-lg":  "0 4px 12px rgba(17,24,39,0.06), 0 12px 32px rgba(17,24,39,0.06)",
        "card-hover": "0 8px 24px rgba(79,70,229,0.10), 0 4px 12px rgba(17,24,39,0.06)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1.4, 0.36, 1)",
      },
    },
  },
  plugins: [],
}
export default config
