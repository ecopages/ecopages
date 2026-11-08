import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { litPlugin } from '@ecopages/lit';
import { reactPlugin } from '@ecopages/react';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	integrations: [
		ecopagesJsxPlugin({ extensions: ['.eco.tsx'] }),
		litPlugin(),
		reactPlugin({ extensions: ['.react.tsx'] }),
	],
});
