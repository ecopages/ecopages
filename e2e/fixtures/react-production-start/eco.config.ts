import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';
import { reactPlugin } from '@ecopages/react';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

export default defineConfig({
	rootDir: import.meta.dirname,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	integrations: [kitajsPlugin(), reactPlugin({ extensions: ['.react.tsx'], explicitGraph: true })],
});
