import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { remarkMermaid } from './src/lib/remark-mermaid';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: 'http://localhost:3000',
	integrations: [
		ecopagesJsxPlugin({
			extensions: ['.tsx'],
			mdx: { remarkPlugins: [remarkMermaid] },
		}),
	],
});
