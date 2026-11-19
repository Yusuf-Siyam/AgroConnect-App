/**
 * Shared design tokens. Tailwind equivalents are declared in tailwind.config.js;
 * this module is used where a native color value is required at runtime.
 */
export const theme = {
  colors: {
    primary: '#2E7D32',
    secondary: '#1B5E20',
    accent: '#66BB6A',
    canvas: '#F6F8F4',
    surface: '#FFFFFF',
    ink: '#1F2937',
    muted: '#64748B',
    line: '#E2E8F0',
    danger: '#DC2626',
    warning: '#D97706',
    success: '#2E7D32',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const;
