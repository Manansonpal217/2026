import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-primary':
          'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85))',
        'gradient-mesh':
          'linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, transparent 50%, hsl(var(--primary) / 0.06) 100%)',
      },
      boxShadow: {
        'glow-sm': '0 0 12px -2px hsl(var(--primary) / 0.28)',
        'glow-indigo': '0 0 20px -2px hsl(var(--primary) / 0.35)',
        'glow-violet': '0 0 20px -2px hsl(var(--primary) / 0.28)',
        'soft-lg': '0 18px 40px -16px rgb(15 23 42 / 0.09), 0 0 0 1px rgb(15 23 42 / 0.04)',
        'soft-lg-dark': '0 18px 40px -16px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(255 255 255 / 0.06)',
        'auth-card':
          '0 22px 50px -14px rgb(15 23 42 / 0.1), 0 0 0 1px rgb(15 23 42 / 0.05), 0 1px 2px rgb(15 23 42 / 0.04)',
        'auth-card-dark':
          '0 24px 48px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'fade-in-up-delay-1': 'fade-in-up 0.6s ease-out 0.1s forwards',
        'fade-in-up-delay-2': 'fade-in-up 0.6s ease-out 0.2s forwards',
        'fade-in-up-delay-3': 'fade-in-up 0.6s ease-out 0.3s forwards',
        'fade-in-up-delay-4': 'fade-in-up 0.6s ease-out 0.4s forwards',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        float: 'float 8s ease-in-out infinite',
        'float-slow': 'float 12s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 10s ease infinite',
        'gradient-flow': 'gradient-flow 6s ease-in-out infinite',
        shimmer: 'shimmer 2s ease-in-out infinite',
        'gradient-text': 'gradient-text 4s ease-in-out infinite',
        'marquee-logos': 'marquee-logos 28s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'marquee-logos': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px hsl(var(--primary) / 0.22)' },
          '50%': { boxShadow: '0 0 40px hsl(var(--primary) / 0.38)' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(20px, -20px)' },
        },
        'gradient-shift': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'gradient-flow': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'gradient-text': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}

export default config
