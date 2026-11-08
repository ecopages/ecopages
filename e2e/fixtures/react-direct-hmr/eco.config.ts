import { defineConfig } from '@ecopages/core/config';
import { litPlugin } from '@ecopages/lit';
import { reactPlugin } from '@ecopages/react';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

/**
 * @remarks
 * `explicitGraph` hydrates every React Page without a router, so an edit to a Page is applied by a direct HMR
 * render instead of a router reload.
 */
export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	integrations: [litPlugin(), reactPlugin({ explicitGraph: true })],
});
