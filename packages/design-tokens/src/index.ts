export const designTokens = {
  colors: {
    canvas: "#f3f7fc",
    canvasDeep: "#eaf1f8",
    text: "#172235",
    textSecondary: "#42536a",
    textMuted: "#78879a",
    blue: "#4da3ff",
    blueDeep: "#2f6fcc",
    success: "#18b66a",
    warning: "#e0a22f",
    danger: "#ef5555",
    mint: "#52cfa9",
  },
  radii: {
    small: "12px",
    medium: "16px",
    large: "22px",
    xlarge: "30px",
    pill: "999px",
  },
  spacing: {
    page: "24px",
    section: "20px",
    card: "16px",
    control: "12px",
    compact: "8px",
  },
  typography: {
    pageTitle: "28px",
    sectionTitle: "18px",
    body: "14px",
    caption: "12px",
  },
  motion: {
    quick: 150,
    control: 180,
    page: 320,
    drawer: 360,
    ease: [0.22, 1, 0.36, 1] as const,
  },
  effects: {
    glassBlur: "16px",
    glassShadow:
      "0 18px 48px rgba(55,91,133,.10), 0 2px 8px rgba(55,91,133,.04), inset 0 1px 0 rgba(255,255,255,.9)",
  },
} as const;
