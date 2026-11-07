import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: 'http://localhost:3000',
	integrations: [ecopagesJsxPlugin({ extensions: ['.tsx'] })],
});
