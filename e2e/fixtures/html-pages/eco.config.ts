import { defineConfig } from '@ecopages/core/config';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	sitemap: { enabled: true },
	devPrewarmBeforeReadyPaths: ['/about', '/buttons'],
});
