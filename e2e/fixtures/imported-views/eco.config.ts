import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';

export default defineConfig({
	rootDir: import.meta.dirname,
	integrations: [kitajsPlugin()],
});
