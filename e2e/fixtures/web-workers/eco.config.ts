import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

export default defineConfig({
	rootDir: import.meta.dirname,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	integrations: [ecopagesJsxPlugin({ extensions: ['.eco.tsx'] })],
});
