import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveHmrEntrypointOutputPaths } from './hmr-entrypoint-output.ts';

describe('resolveHmrEntrypointOutputPaths', () => {
	it('maps script entrypoints to _hmr output paths', () => {
		const srcDir = '/app/src';
		const distDir = '/app/.eco/assets/_hmr';

		expect(
			resolveHmrEntrypointOutputPaths(
				srcDir,
				distDir,
				'/app/src/components/script-hmr/script-hmr-marker.eco.tsx',
			),
		).toEqual({
			outputUrl: '/assets/_hmr/components/script-hmr/script-hmr-marker.eco.js',
			outputPath: path.join(distDir, 'components/script-hmr/script-hmr-marker.eco.js'),
		});
	});

	it('encodes dynamic route segments in output paths', () => {
		const srcDir = '/app/src';
		const distDir = '/app/.eco/assets/_hmr';

		expect(resolveHmrEntrypointOutputPaths(srcDir, distDir, '/app/src/pages/blog/[slug].tsx')).toEqual({
			outputUrl: '/assets/_hmr/pages/blog/_slug_.js',
			outputPath: path.join(distDir, 'pages/blog/_slug_.js'),
		});
	});
});
