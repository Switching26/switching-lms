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
        primary: "#1a1a2e",
        background: "#FFFFFF",
        muted: "#f8f7f4",
        border: "#e8e6e1",
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
        sans: ["DM Sans", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
}
export default config
