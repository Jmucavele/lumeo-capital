/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0A0E14',
          900: '#0F1521',
          800: '#161F30',
          700: '#202B40',
          600: '#324159',
        },
        parchment: {
          50: '#FBF9F4',
          100: '#F4F0E6',
          200: '#E9E2D0',
        },
        brass: {
          400: '#E8B95E',
          500: '#D9A441',
          600: '#B9832A',
        },
        moss: {
          400: '#7FAE8C',
          500: '#5C9270',
          600: '#437256',
        },
        rust: {
          400: '#DB7B63',
          500: '#C15D42',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(10,14,20,0.06), 0 8px 24px -8px rgba(10,14,20,0.18)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
