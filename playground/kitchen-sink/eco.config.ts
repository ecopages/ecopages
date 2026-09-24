import { defineConfig } from '@ecopages/core/config';
import { createKitchenSinkUserConfig } from './kitchen-sink-config.ts';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();
const distDir = artifactScope ? `dist-${artifactScope}` : 'dist';
const workDir = artifactScope ? `.eco-${artifactScope}` : '.eco';

export default defineConfig(
	createKitchenSinkUserConfig({
		distDir,
		workDir,
	}),
);
