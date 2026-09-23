import { defineConfig } from '@ecopages/core/config';
import { createKitchenSinkUserConfig } from './kitchen-sink-config.ts';

const appRoot = process.cwd();
const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();
const distDir = artifactScope ? `dist-${artifactScope}` : 'dist';
const workDir = artifactScope ? `.eco-${artifactScope}` : '.eco';

export default defineConfig(
	createKitchenSinkUserConfig({
		rootDir: appRoot,
		distDir,
		workDir,
		baseUrl: process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
	}),
);
