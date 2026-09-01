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
        // 品牌主色：翰墨青（墨绿 · 砚青）
        brand: {
          50: '#eef6f4',
          100: '#d7eae6',
          200: '#b0d6cf',
          300: '#7fbbb1',
          400: '#4f9a8e',
          500: '#37806f',
          600: '#2a6658',
          700: '#235249',
          800: '#1f443e',
          900: '#1b3834',
          950: '#0f2320',
        },
        // 辅助色：朱砂印（印章红 · 点睛）
        accent: {
          50: '#fdf2f1',
          100: '#fbe3e0',
          200: '#f7c6c2',
          300: '#ef9d96',
          400: '#e46a60',
          500: '#d34337',
          600: '#c0332c',
          700: '#a22a25',
          800: '#852521',
          900: '#6d211e',
        },
        // 中性：宣纸暖灰
        paper: {
          DEFAULT: '#f5f0e6',
          50: '#fbf8f1',
          100: '#f6f0e2',
          200: '#ece1c9',
          300: '#ddc8a6',
          400: '#c8ab7c',
          500: '#b6915b',
          600: '#a07b49',
          700: '#82613a',
          800: '#684c2f',
          900: '#513a25',
        },
        // 墨色（正文/前景）
        ink: {
          DEFAULT: '#29231b',
          50: '#f4f2ef',
          100: '#e6e1d9',
          300: '#8c8374',
          400: '#5d554a',
          500: '#3a332b',
          600: '#2c261f',
          700: '#211c16',
          900: '#14110d',
        },
        // 覆盖默认 stone：暖墨中性（保持 class 名让全站色温统一）
        stone: {
          50: '#faf7f1',
          100: '#f3eee2',
          200: '#e8e0cb',
          300: '#d7cbb0',
          400: '#b3a57e',
          500: '#907e58',
          600: '#6b5e3f',
          700: '#4f4430',
          800: '#352d20',
          900: '#272017',
          950: '#19140e',
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
