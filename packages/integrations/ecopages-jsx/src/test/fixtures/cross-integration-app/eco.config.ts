import { defineConfig } from '@ecopages/core/config';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: 'http://localhost:3000',
	defaultMetadata: { title: 'Ecopages', description: 'Ecopages' },
	robotsTxt: { preferences: { '*': [] } },
});
