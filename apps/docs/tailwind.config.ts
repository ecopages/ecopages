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
				'night-sky': {
					50: 'hsl(var(--color-night-sky-50-hsla))',
					100: 'hsl(var(--color-night-sky-100-hsla))',
					200: 'hsl(var(--color-night-sky-200-hsla))',
					300: 'hsl(var(--color-night-sky-300-hsla))',
					400: 'hsl(var(--color-night-sky-400-hsla))',
					500: 'hsl(var(--color-night-sky-500-hsla))',
					600: 'hsl(var(--color-night-sky-600-hsla))',
					700: 'hsl(var(--color-night-sky-700-hsla))',
					800: 'hsl(var(--color-night-sky-800-hsla))',
					900: 'hsl(var(--color-night-sky-900-hsla))',
					950: 'hsl(var(--color-night-sky-950-hsla))',
				},
				'glacier-white': {
					50: 'hsl(var(--color-glacier-white-50-hsla))',
					100: 'hsl(var(--color-glacier-white-100-hsla))',
					200: 'hsl(var(--color-glacier-white-200-hsla))',
					300: 'hsl(var(--color-glacier-white-300-hsla))',
					400: 'hsl(var(--color-glacier-white-400-hsla))',
					500: 'hsl(var(--color-glacier-white-500-hsla))',
					600: 'hsl(var(--color-glacier-white-600-hsla))',
					700: 'hsl(var(--color-glacier-white-700-hsla))',
					800: 'hsl(var(--color-glacier-white-800-hsla))',
					900: 'hsl(var(--color-glacier-white-900-hsla))',
					950: 'hsl(var(--color-glacier-white-950-hsla))',
				},
			},
			fontFamily: {
				sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				heading: ['Karla', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				mono: ['Inconsolata', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
			},
		},
	},
	plugins: [],
	safelist: ['hidden', 'overflow-hidden'],
};

export default config;
