import { borderRadius } from '@/tailwind/misc.js';
import type { Config } from 'tailwindcss';
import { colors } from './src/tailwind/colors.js';

const config: Config = {
  content: ['./src/**/*.tsx'],
  theme: { colors, borderRadius },
  plugins: [],
  safelist: ['hidden'],
};

export default config;
