import { defineConfig } from '@ecopages/core/config';
import { reactPlugin } from '@ecopages/react';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

/**
 * @remarks
 * `explicitGraph` hydrates every React Page without a router so a failed
 * `React.lazy` chunk during first hydration is observable.
 */
export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	integrations: [reactPlugin({ explicitGraph: true })],
});
