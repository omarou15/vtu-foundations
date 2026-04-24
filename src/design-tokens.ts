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
    // Brand
    primary: "#FF6B35",
    primaryHover: "#E85A2A",
    primaryActive: "#D14E20",

    // Surfaces
    bg: "#FFFFFF",
    bgMuted: "#FAFAF9",
    bgSubtle: "#F5F5F4",

    // Text
    text: "#1C1917",
    textMuted: "#78716C",
    textSubtle: "#A8A29E",
    textOnPrimary: "#FFFFFF",

    // Borders
    border: "#E7E5E4",
    borderStrong: "#D6D3D1",

    // Status (sémantique)
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#3B82F6",

    // VT statuses
    statusInProgress: "#10B981",
    statusDone: "#6B7280",
    statusDraft: "#F59E0B",

    // Connectivity
    online: "#10B981",
    offline: "#9CA3AF",
  },

  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
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
