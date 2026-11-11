// Keep the existing theme variables usable with Tailwind opacity modifiers.
// A bare var(--color-*) cannot be parsed into channels for classes such as bg-primary/10.
const themeColor = variable => ({ opacityValue }) => opacityValue === undefined
  ? `var(${variable})`
  : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: themeColor('--color-background'),
        surface: themeColor('--color-surface'),
        primary: themeColor('--color-primary'),
        secondary: themeColor('--color-secondary'),
        textMain: themeColor('--color-text-main'),
        border: themeColor('--color-border'),
        success: themeColor('--color-success'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
