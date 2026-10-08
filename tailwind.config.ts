import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core fintech canvas & surfaces
        canvas: {
          light: '#F8FAFC',
          dark: '#080B11',
          DEFAULT: '#080B11',
        },
        surface: {
          DEFAULT: '#0F1420',
          elevated: '#151C2C',
          overlay: '#1B2438',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-subtle': 'rgba(255, 255, 255, 0.04)',
        },
        // Light-mode counterparts
        'surface-light': {
          DEFAULT: '#FFFFFF',
          elevated: '#F8FAFC',
          overlay: '#F1F5F9',
          border: '#E2E8F0',
          'border-subtle': '#F1F5F9',
        },
        // Semantic financial indicators
        fintech: {
          green: {
            DEFAULT: '#10B981',
            muted: 'rgba(16, 185, 129, 0.12)',
            border: 'rgba(16, 185, 129, 0.25)',
          },
          amber: {
            DEFAULT: '#F59E0B',
            muted: 'rgba(245, 158, 11, 0.12)',
            border: 'rgba(245, 158, 11, 0.25)',
          },
          red: {
            DEFAULT: '#EF4444',
            muted: 'rgba(239, 68, 68, 0.12)',
            border: 'rgba(239, 68, 68, 0.25)',
          },
          blue: {
            DEFAULT: '#3B82F6',
            muted: 'rgba(59, 130, 246, 0.12)',
            border: 'rgba(59, 130, 246, 0.25)',
          },
          purple: {
            DEFAULT: '#8B5CF6',
            muted: 'rgba(139, 92, 246, 0.12)',
            border: 'rgba(139, 92, 246, 0.25)',
          },
        },
        // Business identity tags
        biz: {
          haron: {
            DEFAULT: '#F43F5E',
            bg: 'rgba(244, 63, 94, 0.12)',
            border: 'rgba(244, 63, 94, 0.24)',
          },
          zenith: {
            DEFAULT: '#0284C7',
            bg: 'rgba(2, 132, 199, 0.12)',
            border: 'rgba(2, 132, 199, 0.24)',
          },
          master: {
            DEFAULT: '#8B5CF6',
            bg: 'rgba(139, 92, 246, 0.12)',
            border: 'rgba(139, 92, 246, 0.24)',
          },
        },
      },
      borderRadius: {
        fintech: '8px',
        card: '12px',
        modal: '14px',
      },
      boxShadow: {
        'fintech-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.2)',
        'fintech-card': '0 4px 20px -2px rgba(0, 0, 0, 0.35)',
        'fintech-glow-green': '0 0 24px -4px rgba(16, 185, 129, 0.2)',
        'fintech-glow-amber': '0 0 24px -4px rgba(245, 158, 11, 0.2)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
