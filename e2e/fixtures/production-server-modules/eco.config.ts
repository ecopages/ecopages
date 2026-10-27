import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { reactPlugin } from '@ecopages/react';

export default defineConfig(() => ({
	rootDir: import.meta.dirname,
	integrations: [
		kitajsPlugin(),
		ecopagesJsxPlugin({ extensions: ['.eco.tsx'] }),
		litPlugin(),
		reactPlugin({ extensions: ['.react.tsx'] }),
	],
}));
