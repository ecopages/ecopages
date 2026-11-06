import { defineConfig } from '@ecopages/core/config';

const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();

/** The HTML Pages app with response headers for the `response-headers` specs: cross-origin isolation and scoped CORS. */
export default defineConfig({
	rootDir: import.meta.dirname,
	distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
	workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
	headers: [
		{
			source: '/**',
			headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
		},
		{ source: '/images/*', headers: { 'Access-Control-Allow-Origin': '*' } },
	],
});
