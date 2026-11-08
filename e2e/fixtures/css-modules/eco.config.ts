import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { litPlugin } from '@ecopages/lit';
import { reactPlugin } from '@ecopages/react';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	integrations: [
		ecopagesJsxPlugin({ extensions: ['.eco.tsx'] }),
		litPlugin(),
		reactPlugin({ extensions: ['.react.tsx'] }),
	],
	processors: [lightningCssProcessorPlugin()],
});
