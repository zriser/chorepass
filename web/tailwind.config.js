/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fredoka"', "system-ui", "sans-serif"],
        body: ['"Nunito"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        paper: "#FFF7E8",
        "paper-deep": "#F4E9D2",
        ink: "#1F1611",
        "ink-soft": "#3A2A20",
        berry: "#E94886",
        "berry-deep": "#B8255F",
        ocean: "#2BB7C4",
        "ocean-deep": "#1A8993",
        sunshine: "#FFC93C",
        tangerine: "#FF7A45",
        mint: "#5BD9A4",
        grape: "#9B6FE0",
        cocoa: "#8B5A3C",
      },
      boxShadow: {
        sticker: "4px 4px 0 #1F1611",
        "sticker-sm": "2px 2px 0 #1F1611",
        "sticker-lg": "8px 8px 0 #1F1611",
        "sticker-xl": "12px 12px 0 #1F1611",
        "sticker-press": "2px 2px 0 #1F1611",
      },
      borderWidth: {
        3: "3px",
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.6) rotate(-6deg)", opacity: "0" },
          "60%": { transform: "scale(1.08) rotate(2deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0)", opacity: "1" },
        },
        stamp: {
          "0%": { transform: "scale(1) rotate(0)" },
          "30%": { transform: "scale(1.25) rotate(-8deg)" },
          "60%": { transform: "scale(0.92) rotate(3deg)" },
          "100%": { transform: "scale(1) rotate(-2deg)" },
        },
        "float-up": {
          "0%": { transform: "translateY(0) scale(0.6)", opacity: "0" },
          "20%": { opacity: "1", transform: "translateY(-12px) scale(1.1)" },
          "100%": { transform: "translateY(-80px) scale(1)", opacity: "0" },
        },
        "confetti-fall": {
          "0%": { transform: "translateY(-20vh) rotate(0)", opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(720deg)", opacity: "0.8" },
        },
        "shake-x": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
        "drift-slow": {
          "0%, 100%": { transform: "translate(0, 0) rotate(0)" },
          "50%": { transform: "translate(8px, -10px) rotate(3deg)" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        wiggle: "wiggle 0.5s ease-in-out",
        "wiggle-slow": "wiggle 1.6s ease-in-out infinite",
        "pop-in": "pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        stamp: "stamp 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "float-up": "float-up 0.9s ease-out both",
        "shake-x": "shake-x 0.35s ease-in-out",
        "drift-slow": "drift-slow 6s ease-in-out infinite",
        "spin-slow": "spin 18s linear infinite",
      },
    },
  },
  plugins: [],
};
