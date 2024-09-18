import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{tsx,mdx}'],
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        'on-background': 'hsl(var(--on-background))',
        'background-accent': 'hsl(var(--background-accent))',
        'on-background-accent': 'hsl(var(--on-background-accent))',
        'primary-container': 'hsl(var(--primary-container))',
        'on-primary-container': 'hsl(var(--on-primary-container))',
        primary: 'hsl(var(--primary))',
        'on-primary': 'hsl(var(--on-primary))',
        secondary: 'hsl(var(--secondary))',
        'on-secondary': 'hsl(var(--on-secondary))',
        border: 'hsl(var(--border))',
        'background-code': 'hsl(var(--background-code))',
        'on-background-code': 'hsl(var(--on-background-code))',
        link: 'hsl(var(--link))',
      },
    },
  },
  plugins: [],
  safelist: ['hidden', 'overflow-hidden'],
};

export default config;
