import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0c0c0e',
        surface: '#16161a',
        foreground: '#f8fafc',
        primary: '#6366f1',
        accent: '#8b5cf6',
        muted: '#64748b',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-primary': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        'gradient-mesh':
          'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, transparent 50%, rgba(139,92,246,0.1) 100%)',
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
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(99,102,241,0.4)' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(20px, -20px)' },
        },
        'gradient-shift': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
}

export default config
