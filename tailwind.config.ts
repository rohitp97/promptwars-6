import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Text/background pairs are checked against WCAG AA in src/__tests__/contrast.test.ts.
      colors: {
        paper: '#fbf6ee',
        card: '#ffffff',
        ink: '#2a1a20',
        muted: '#5d4b53',
        line: '#e3d6c6',
        brand: '#7a1f3d',
        brandSoft: '#f7e6ec',
        gold: '#8a5a00',
        goldSoft: '#fdf0d5',
        quote: '#1d6b45',
        quoteSoft: '#e3f3ea',
        you: '#244f8f',
        youSoft: '#e4edf9',
        estimate: '#8a5a00',
        estimateSoft: '#fdf0d5',
        danger: '#a12a2a',
        dangerSoft: '#fbe6e6',
      },
      fontFamily: {
        // System fonts only: no third-party font requests, and Windows/Android ship Devanagari faces.
        sans: ['system-ui', '"Segoe UI"', '"Nirmala UI"', '"Noto Sans Devanagari"', 'Roboto', 'sans-serif'],
        serif: ['Georgia', '"Noto Serif Devanagari"', '"Nirmala UI"', 'serif'],
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { rise: 'rise 0.25s ease-out' },
    },
  },
  plugins: [],
} satisfies Config
