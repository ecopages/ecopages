import type { Config } from 'tailwindcss';

const config: Config = {
	content: ['./src/**/*.tsx'],
	theme: {
		extend: {},
	},
	plugins: [],
	safelist: ['hidden'],
};

export default config;
