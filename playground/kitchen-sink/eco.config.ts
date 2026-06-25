import { createKitchenSinkConfig } from './kitchen-sink-config.ts';

const appRoot = process.cwd();
const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();
const distDir = artifactScope ? `dist-${artifactScope}` : 'dist';
const workDir = artifactScope ? `.eco-${artifactScope}` : '.eco';

const config = await createKitchenSinkConfig({
	rootDir: appRoot,
	distDir,
	workDir,
	baseUrl: process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
});

export default config;
