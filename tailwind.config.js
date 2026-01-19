/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#1a1a1a',
          surface: '#242424',
          hover: '#2d2d2d',
          border: '#3a3a3a',
          text: '#e0e0e0',
          'text-secondary': '#a0a0a0',
        }
      }
    },
  },
  plugins: [],
}
