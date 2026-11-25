/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
      },
      fontFamily: {
        ui: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'system-ui', 'sans-serif'],
        serif: ['Amiri', '"Noto Naskh Arabic"', 'Georgia', 'serif'],
      },
      borderRadius: { xl2: '1.125rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / .12), 0 8px 24px -12px rgb(0 0 0 / .35)',
        lift: '0 2px 6px rgb(0 0 0 / .15), 0 24px 48px -20px rgb(0 0 0 / .5)',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { fadeIn: 'fadeIn .25s ease-out both' },
    },
  },
  plugins: [],
};
