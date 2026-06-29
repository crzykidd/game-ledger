/** @type {import('tailwindcss').Config} */
export default {
  // Scan the whole src tree so Tailwind picks up classes from the new shared
  // components/ui/ AND the converted Dashboard. The preview/ subtree is also
  // covered here (it will share the same CSS bundle going forward).
  content: ['./src/**/*.{ts,tsx}'],

  // Dark mode: driven by data-theme="dark" on <html> (set by theme.ts / initTheme).
  // This is already what the existing design-system tokens.css uses, so both
  // systems respond to the same attribute without conflicting.
  darkMode: ['class', '[data-theme="dark"]'],

  corePlugins: {
    // KEEP preflight disabled — it would clobber the hand-rolled design-system
    // resets (box-sizing, margin/padding 0, body styles, etc.) used by all
    // unconverted screens. Both systems must coexist during migration.
    preflight: false,
  },

  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          foreground: '#ffffff',
        },
        indigo: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl:  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-up':  'fadeUp 0.4s ease-out both',
        'scale-in': 'scaleIn 0.2s ease-out both',
        shimmer:    'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
