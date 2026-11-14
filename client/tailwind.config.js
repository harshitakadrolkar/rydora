/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#070a17', 900: '#0b1020', 850: '#0f1530', 800: '#131a3a', 700: '#1c2550', 600: '#2a3570', 500: '#3b4890' },
        brand: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
        aqua: { 400: '#22d3ee', 500: '#06b6d4' },
        auto: { 300: '#ffe066', 400: '#f5c400', 500: '#e0b000', 600: '#b38f00' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        logo: ['Unbounded', 'Sora', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.25), 0 10px 40px -10px rgba(139,92,246,.45)',
        card: '0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.6)',
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        fadeup: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        pulsering: { '0%': { transform: 'scale(.8)', opacity: .8 }, '100%': { transform: 'scale(2.2)', opacity: 0 } },
      },
      animation: { floaty: 'floaty 5s ease-in-out infinite', fadeup: 'fadeup .45s ease-out both', pulsering: 'pulsering 1.8s ease-out infinite' },
    },
  },
  plugins: [],
};
