import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	isRegisteredScriptEntrypoint,
	isBrowserOnlyRegisteredScriptEntrypoint,
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

describe('isRegisteredScriptEntrypoint', () => {
	it('matches paths registered in the HMR entrypoint map', () => {
		const entrypoint = '/app/src/components/theme-toggle.tsx';
		const registered = new Map([
			[
				entrypoint,
				{
					sourcePath: entrypoint,
					outputPath: '/app/.eco/assets/_hmr/components/theme-toggle.js',
					outputUrl: '/assets/_hmr/components/theme-toggle.js',
				},
			],
		]);

		expect(isRegisteredScriptEntrypoint(registered, entrypoint)).toBe(true);
		expect(isRegisteredScriptEntrypoint(registered, '/app/src/components/other.tsx')).toBe(false);
	});

	it('normalizes registered entrypoint paths before matching', () => {
		const registered = new Map([
			[
				'/app/src/components/counter.ts',
				{
					sourcePath: '/app/src/components/counter.ts',
					outputPath: '/app/.eco/assets/_hmr/counter.js',
					outputUrl: '/assets/_hmr/counter.js',
				},
			],
		]);

		expect(isRegisteredScriptEntrypoint(registered, '/app/src/components/../components/counter.ts')).toBe(true);
	});
});

describe('isBrowserOnlyRegisteredScriptEntrypoint', () => {
	it('matches declared browser script entrypoints', () => {
		expect(isBrowserOnlyRegisteredScriptEntrypoint('/app/src/layouts/base-layout/base-layout.script.ts')).toBe(
			true,
		);
		expect(isBrowserOnlyRegisteredScriptEntrypoint('/app/src/components/widget.script.tsx')).toBe(false);
		expect(isBrowserOnlyRegisteredScriptEntrypoint('/app/src/components/widget.script.eco.tsx')).toBe(false);
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
