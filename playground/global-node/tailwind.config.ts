import type { Config } from 'tailwindcss';

const config: Config = {
	content: ['./src/**/*.{kita,lit}.{tsx,ts}'],
	theme: {
		extend: {},
	},
	plugins: [],
	safelist: ['hidden'],
};

export default config;
