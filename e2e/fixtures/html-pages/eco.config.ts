import { defineConfig } from '@ecopages/core/config';

export default defineConfig({
	rootDir: import.meta.dir,
	baseUrl: import.meta.env.ECOPAGES_BASE_URL,
	sitemap: { enabled: true },
});
