import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const persistLayouts = import.meta.env.ECOPAGES_PERSIST_LAYOUTS === 'true';
const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();
const distDir = artifactScope ? `dist-${artifactScope}` : 'dist';
const workDir = artifactScope ? `.eco-${artifactScope}` : '.eco';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setDistDir(distDir)
	.setWorkDir(workDir)
	.setIntegrations([
		reactPlugin({
			router: ecoRouter({ persistLayouts }),
			mdx: { enabled: true },
		}),
	])
	.build();

export default config;
