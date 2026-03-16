import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        background: '#08090d',
        surface: '#0d1117',
        card: 'rgba(255,255,255,0.04)',
        border: 'rgba(255,255,255,0.08)',
        primary: '#6366f1',
        'primary-hover': '#4f46e5',
        'primary-dark': '#3730a3',
        violet: '#8b5cf6',
        foreground: '#f9fafb',
        'foreground-secondary': '#9ca3af',
        muted: '#6b7280',
        destructive: '#ef4444',
        success: '#10b981',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-indigo': '0 0 20px rgba(99, 102, 241, 0.3), 0 0 40px rgba(99, 102, 241, 0.1)',
        'glow-sm': '0 0 8px rgba(99, 102, 241, 0.4)',
        card: '0 4px 24px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
        'card-border': '0 0 0 1px rgba(255,255,255,0.08)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'orb-float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(20px, -15px) scale(1.05)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'border-glow': {
          '0%, 100%': { opacity: '0.5', boxShadow: '0 0 20px rgba(99,102,241,0.2)' },
          '50%': { opacity: '1', boxShadow: '0 0 30px rgba(99,102,241,0.4)' },
        },
        'float-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer-border': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        'error-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        'timer-glow': {
          '0%, 100%': { opacity: '0.6', filter: 'drop-shadow(0 0 20px rgba(99,102,241,0.3))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 40px rgba(99,102,241,0.5))' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.02)', opacity: '0.95' },
        },
        'dots-pulse': {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
        'loader-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'spread-from-corner': {
          '0%': { clipPath: 'circle(0 at 100% 0)' },
          '100%': { clipPath: 'circle(200% at 100% 0)' },
        },
        'spread-backdrop': {
          '0%': { clipPath: 'circle(0 at 100% 0)' },
          '100%': { clipPath: 'circle(200% at 100% 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.4s ease-out',
        'spin-slow': 'spin-slow 2s linear infinite',
        'orb-float': 'orb-float 6s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        pulse: 'pulse 2s ease-in-out infinite',
        'border-glow': 'border-glow 3s ease-in-out infinite',
        'float-subtle': 'float-subtle 4s ease-in-out infinite',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.16,1,0.3,1)',
        'error-shake': 'error-shake 0.4s ease-out',
        'timer-glow': 'timer-glow 3s ease-in-out infinite',
        breathe: 'breathe 4s ease-in-out infinite',
        'dots-pulse': 'dots-pulse 1.4s ease-in-out infinite',
        'loader-spin': 'loader-spin 0.8s linear infinite',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16,1,0.3,1)',
        'spread-from-corner': 'spread-from-corner 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        'spread-backdrop': 'spread-backdrop 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}

export default config
