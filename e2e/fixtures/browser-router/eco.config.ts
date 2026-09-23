import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';

export default defineConfig({
	rootDir: import.meta.dir,
	baseUrl: import.meta.env.ECOPAGES_BASE_URL,
	integrations: [
		kitajsPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	],
});
