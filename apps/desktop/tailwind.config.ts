import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        avs: {
          canvas: "#f3f7fc",
          canvasDeep: "#eaf1f8",
          ink: "#172235",
          inkSoft: "#42536a",
          muted: "#78879a",
          blue: "#4da3ff",
          blueDeep: "#2f6fcc",
          mint: "#52cfa9",
          success: "#18b66a",
          danger: "#ef5555",
        },
      },
      borderRadius: {
        card: "16px",
        panel: "22px",
        shell: "30px",
      },
      boxShadow: {
        glass:
          "0 18px 48px rgba(55,91,133,.10),0 2px 8px rgba(55,91,133,.04),inset 0 1px 0 rgba(255,255,255,.9)",
        control:
          "0 6px 20px rgba(63,102,160,.10),inset 0 1px 0 rgba(255,255,255,.84)",
      },
      fontFamily: {
        sans: [
          "Segoe UI Variable Text",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
