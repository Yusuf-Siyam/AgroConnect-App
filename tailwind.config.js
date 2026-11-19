/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};
