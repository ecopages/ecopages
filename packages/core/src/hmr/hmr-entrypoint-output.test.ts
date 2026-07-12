import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	isDeclaredClientScriptEntrypoint,
	isHmrOutputFresh,
	resolveHmrEntrypointOutputPaths,
} from './hmr-entrypoint-output.ts';

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

describe('isDeclaredClientScriptEntrypoint', () => {
	it('recognizes .script.tsx and .script.ts entrypoints', () => {
		expect(isDeclaredClientScriptEntrypoint('/app/src/components/theme-toggle.script.tsx')).toBe(true);
		expect(isDeclaredClientScriptEntrypoint('/app/src/components/theme-toggle.script.ts')).toBe(true);
		expect(isDeclaredClientScriptEntrypoint('/app/src/components/theme-toggle.tsx')).toBe(false);
	});
});

describe('isHmrOutputFresh', () => {
	it('returns true when output mtime is newer than source mtime', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hmr-fresh-'));
		const sourcePath = path.join(root, 'widget.script.tsx');
		const outputPath = path.join(root, 'widget.script.js');

		fs.writeFileSync(sourcePath, 'source');
		fs.writeFileSync(outputPath, 'output');

		const sourceMtime = new Date(Date.now() - 1_000);
		fs.utimesSync(sourcePath, sourceMtime, sourceMtime);

		expect(isHmrOutputFresh(outputPath, sourcePath)).toBe(true);

		fs.rmSync(root, { recursive: true, force: true });
	});
});
