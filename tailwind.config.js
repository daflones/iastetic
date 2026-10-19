/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1320px' } },
    extend: {
      fontFamily: {
        display: ['"Sora"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        accent: {
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
      },
      boxShadow: {
        soft: '0 10px 40px -12px rgb(var(--brand-900) / 0.12)',
        card: '0 1px 2px rgb(var(--ink) / 0.04), 0 8px 24px -12px rgb(var(--ink) / 0.10)',
        glow: '0 0 0 1px rgb(var(--brand-300) / 0.5), 0 12px 40px -10px rgb(var(--brand-500) / 0.45)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        typing: { '0%,60%,100%': { transform: 'translateY(0)' }, '30%': { transform: 'translateY(-4px)' } },
      },
      animation: {
        'fade-up': 'fade-up .5s ease-out both',
        float: 'float 6s ease-in-out infinite',
        typing: 'typing 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
