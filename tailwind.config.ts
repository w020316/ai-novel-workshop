import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 品牌主色：墨韵青（深沉书卷气）
        brand: {
          50: '#f0f7f6',
          100: '#daece9',
          200: '#b8d9d4',
          300: '#8cbfb8',
          400: '#5fa098',
          500: '#3d847c',
          600: '#2e6a64',
          700: '#275451',
          800: '#234445',
          900: '#1f393c',
          950: '#0f2123',
        },
        // 辅助色：丹砂红（点睛之笔）
        accent: {
          50: '#fef3f2',
          100: '#fee4e3',
          200: '#fecdcb',
          300: '#fda9a6',
          400: '#fb7269',
          500: '#ef443c',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Noto Serif SC', 'serif'],
        mono: ['ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
