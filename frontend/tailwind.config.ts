import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#09090b',
          raised: '#111114',
          overlay: '#1a1a1f',
        },
        accent: {
          DEFAULT: '#7c83ff',
          hover: '#6b72e8',
          soft: 'rgba(124, 131, 255, 0.12)',
        },
        border: {
          DEFAULT: 'rgba(63, 63, 70, 0.45)',
          strong: 'rgba(82, 82, 91, 0.75)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-up': 'fadeInUp 0.6s ease-out',
        'float': 'floatSoft 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
