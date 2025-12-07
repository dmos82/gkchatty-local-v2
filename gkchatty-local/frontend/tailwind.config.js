/** @type {import("tailwindcss").Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        'goldkey-dark-grey': '#454545',
        'goldkey-gold': '#FFD700',
        'goldkey-khaki': '#BDB76B',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      fontSize: {
        base: '13px',
        sm: '12px',
        xs: '11px',
      },
      spacing: {
        12: '3rem',
        14: '3.5rem',
        3.5: '0.875rem',
        4.5: '1.125rem',
        // Safe area insets for iOS notch
        'safe': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      minHeight: {
        'touch': '44px', // Apple HIG minimum touch target
        'touch-md': '40px', // Tablet touch target
      },
      minWidth: {
        'touch': '44px',
        'touch-md': '40px',
      },
      keyframes: {
        fadeInUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        scaleIn: {
          '0%': {
            opacity: '0',
            transform: 'scale(0.9)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        scaleOut: {
          '0%': {
            opacity: '1',
            transform: 'scale(1)',
          },
          '100%': {
            opacity: '0',
            transform: 'scale(0.9)',
          },
        },
        slideInFromBottom: {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px) scale(0.95)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
          },
        },
        minimizeToButton: {
          '0%': {
            opacity: '1',
            transform: 'scale(1)',
          },
          '100%': {
            opacity: '0',
            transform: 'scale(0.5) translateY(100px)',
          },
        },
        expandFromButton: {
          '0%': {
            opacity: '0',
            transform: 'scale(0.5) translateY(100px)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1) translateY(0)',
          },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.3s ease-out',
        scaleIn: 'scaleIn 0.2s ease-out',
        scaleOut: 'scaleOut 0.2s ease-out',
        slideInFromBottom: 'slideInFromBottom 0.25s ease-out',
        minimizeToButton: 'minimizeToButton 0.2s ease-in forwards',
        expandFromButton: 'expandFromButton 0.25s ease-out',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
