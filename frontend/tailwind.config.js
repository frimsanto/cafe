/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Palet "Cafe Ambient" — mencerminkan src/styles/tokens.css agar bisa
        // dipakai sebagai utility (mis. bg-warm-cream, text-warm-espresso) dan
        // mendukung modifier opacity (border-warm-espresso/10). Nilainya harus
        // tetap sinkron dengan tokens.css sebagai sumber kebenaran.
        warm: {
          espresso: '#1a1208',
          amber: '#c8891a',
          cream: '#f0e8da',
          paper: '#fff8f0',
          line: '#e8d5b8',
          muted: '#9a8a7a',
          subtle: '#7a5c2e',
          success: '#4a7a4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
