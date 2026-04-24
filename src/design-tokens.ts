/**
 * VTU Design Tokens — Source de vérité unique du design system.
 *
 * Aucune valeur de couleur/espacement/typo ne doit être hardcodée
 * dans les composants. Toujours référencer ces tokens (via Tailwind
 * classes mappées sur les variables CSS de styles.css, ou via
 * `tokens.*` directement quand inline style est nécessaire).
 */

export const tokens = {
  colors: {
    // Brand — Anthropic Claude (terracotta sophistiqué)
    primary: "#d97757",
    primaryHover: "#c66848",
    primaryActive: "#b4593c",

    // Surfaces (chaleureuses, pas blanc pur)
    bg: "#faf9f5",
    bgMuted: "#f5f3ec",
    bgSubtle: "#e8e6dc",

    // Text
    text: "#141413",
    textMuted: "#6b6a63",
    textSubtle: "#b0aea5",
    textOnPrimary: "#faf9f5",

    // Borders
    border: "#e8e6dc",
    borderStrong: "#b0aea5",

    // Status (sémantique — accents Anthropic)
    success: "#788c5d",
    warning: "#c78640",
    danger: "#b4593c",
    info: "#6a9bcc",

    // VT statuses
    statusInProgress: "#788c5d",
    statusDone: "#b0aea5",
    statusDraft: "#d97757",

    // Connectivity
    online: "#788c5d",
    offline: "#b0aea5",
  },

  typography: {
    fontFamily: {
      heading: '"Poppins", system-ui, -apple-system, Arial, sans-serif',
      body: '"Lora", Georgia, "Times New Roman", serif',
      ui: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    },
    sizes: {
      xs: 12,
      sm: 14,
      base: 16,
      md: 18,
      lg: 20,
      xl: 24,
      "2xl": 32,
    },
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.7,
    },
  },

  radii: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },

  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },

  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },

  // Tactile
  touch: {
    minTarget: 44, // px — Apple HIG / Material guidelines
  },

  // Layout zones (règle 20/60/20)
  layout: {
    headerHeight: 64,
    inputBarHeight: 64,
    sidebarMaxWidth: 420,
  },

  // Animation
  motion: {
    fast: "120ms",
    base: "200ms",
    slow: "320ms",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // Z-index scale
  z: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    overlay: 30,
    drawer: 40,
    modal: 50,
    toast: 60,
  },
} as const;

export type Tokens = typeof tokens;
