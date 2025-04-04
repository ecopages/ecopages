import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{kita,lit}.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: ['hidden'],
};

export default config;
