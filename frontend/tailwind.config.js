/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'count-up': 'count-up 1.5s ease-out',
        'shimmer': 'shimmer 2s infinite',
        'pulse-orange': 'pulse-orange 2s infinite',
        'wave': 'wave 2s infinite'
      },
      keyframes: {
        'count-up': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        'shimmer': {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' }
        },
        'pulse-orange': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 107, 53, 0.7)' },
          '70%': { boxShadow: '0 0 0 10px rgba(255, 107, 53, 0)' }
        },
        'wave': {
          '0%, 100%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(100%)' }
        }
      }
    },
  },
  plugins: [],
}