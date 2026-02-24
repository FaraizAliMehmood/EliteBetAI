/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./App.{js,jsx,ts,tsx}",
      "./src/**/*.{js,jsx,ts,tsx}",
      "./components/**/*.{js,jsx,ts,tsx}",
    ],
    presets: [require("nativewind/preset")],
    theme: {
      extend: {
        colors: {
          'neon-blue': '#0A84FF',
          'neon-green': '#30D158',
          'neon-purple': '#BF5AF2',
          'neon-red': '#FF453A',
          'neon-orange': '#FF9F0A',
          'glass-100': 'rgba(255, 255, 255, 0.05)',
          'glass-200': 'rgba(255, 255, 255, 0.08)',
          'glass-300': 'rgba(255, 255, 255, 0.12)',
          'glass-border': 'rgba(255, 255, 255, 0.1)',
        },
      },
    },
    plugins: [],
  };
  