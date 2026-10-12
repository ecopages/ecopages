import { defineConfig } from '@ecopages/core/config';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const persistLayouts = process.env.ECOPAGES_PERSIST_LAYOUTS === 'true';
const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();
const distDir = artifactScope ? `dist-${artifactScope}` : 'dist';
const workDir = artifactScope ? `.eco-${artifactScope}` : '.eco';

export default defineConfig({
	rootDir: import.meta.dir,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	distDir,
	workDir,
	devPrewarmPaths: ['/eco-layout-missing', '/', '/docs'],
	integrations: [
		reactPlugin({
			router: ecoRouter({ persistLayouts }),
			runtimeModules: ['@tanstack/react-query'],
			mdx: {},
		}),
	],
});
