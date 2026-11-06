import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

export default defineConfig({
	rootDir: import.meta.dirname,
	integrations: [ecopagesJsxPlugin({ extensions: ['.eco.tsx'] })],
});
