import { defineConfig } from '@ecopages/core/config';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
});
