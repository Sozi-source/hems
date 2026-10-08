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
        // Deep Navy palette (reserved for sidebar and authoritative accents)
        navy: {
          50: '#F0F4F8',
          100: '#D9E2EC',
          200: '#BCCCDC',
          700: '#1E293B',
          800: '#0F172A',
          900: '#0A1128',
          DEFAULT: '#0F172A',
        },
        // Rich Maroon / Crimson palette (for Haron Fashion and high-priority indicators)
        maroon: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
          DEFAULT: '#881337',
        },
        // Core surfaces: Dashboard is clean white; Sidebar retains deep navy
        canvas: {
          light: '#FFFFFF',
          DEFAULT: '#F8FAFC',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#F8FAFC',
          overlay: '#F1F5F9',
          border: '#E2E8F0',
          'border-subtle': '#F1F5F9',
        },
        // Semantic financial indicators
        fintech: {
          green: {
            DEFAULT: '#059669',
            muted: 'rgba(5, 150, 105, 0.08)',
            border: 'rgba(5, 150, 105, 0.2)',
          },
          amber: {
            DEFAULT: '#D97706',
            muted: 'rgba(217, 119, 6, 0.08)',
            border: 'rgba(217, 119, 6, 0.2)',
          },
          red: {
            DEFAULT: '#DC2626',
            muted: 'rgba(220, 38, 38, 0.08)',
            border: 'rgba(220, 38, 38, 0.2)',
          },
          blue: {
            DEFAULT: '#2563EB',
            muted: 'rgba(37, 99, 235, 0.08)',
            border: 'rgba(37, 99, 235, 0.2)',
          },
        },
        // Business identity tags
        biz: {
          haron: {
            DEFAULT: '#881337',
            bg: '#FFF1F2',
            border: '#FECDD3',
          },
          zenith: {
            DEFAULT: '#0F172A',
            bg: '#F1F5F9',
            border: '#CBD5E1',
          },
          master: {
            DEFAULT: '#6B21A8',
            bg: '#FAF5FF',
            border: '#E9D5FF',
          },
        },
      },
      borderRadius: {
        fintech: '8px',
        card: '12px',
        modal: '14px',
      },
      boxShadow: {
        'fintech-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'fintech-card': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)',
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
