import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import rehypePrettyCode from 'rehype-pretty-code';
import remarkGfm from 'remark-gfm';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: 'http://localhost:3000',
	integrations: [
		ecopagesJsxPlugin({
			extensions: ['.tsx'],
			mdx: {
				remarkPlugins: [remarkGfm],
				rehypePlugins: [[rehypePrettyCode, { theme: { light: 'light-plus', dark: 'dark-plus' } }]],
			},
		}),
	],
});
