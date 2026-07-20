import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	isRegisteredDevTransformEntrypoint,
	isRegisteredScriptEntrypoint,
	isHmrOutputFresh,
	isHmrOutputOlderThanSource,
	resolveHmrEntrypointOutputPaths,
	type ResolvedHmrEntrypoint,
} from './hmr-entrypoint-output.ts';

function createRegisteredEntrypoint(
	overrides: Partial<ResolvedHmrEntrypoint> & Pick<ResolvedHmrEntrypoint, 'sourcePath'>,
): ResolvedHmrEntrypoint {
	return {
		outputPath: overrides.sourcePath,
		outputUrl: '/assets/__eco_dev__/entry.js',
		role: 'page',
		...overrides,
	};
}

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

describe('isRegisteredDevTransformEntrypoint', () => {
	it('matches paths registered in the HMR entrypoint map', () => {
		const entrypoint = '/app/src/components/theme-toggle.tsx';
		const registered = new Map([
			[
				entrypoint,
				createRegisteredEntrypoint({
					sourcePath: entrypoint,
					outputPath: '/app/.eco/assets/_hmr/components/theme-toggle.js',
					outputUrl: '/assets/_hmr/components/theme-toggle.js',
				}),
			],
		]);

		expect(isRegisteredDevTransformEntrypoint(registered, entrypoint)).toBe(true);
		expect(isRegisteredDevTransformEntrypoint(registered, '/app/src/components/other.tsx')).toBe(false);
	});
});

describe('isRegisteredScriptEntrypoint', () => {
	it('matches only script-role registrations', () => {
		const scriptPath = '/app/src/layouts/base-layout/base-layout.ts';
		const pagePath = '/app/src/pages/index.tsx';
		const registered = new Map([
			[
				scriptPath,
				createRegisteredEntrypoint({
					sourcePath: scriptPath,
					role: 'script',
				}),
			],
			[
				pagePath,
				createRegisteredEntrypoint({
					sourcePath: pagePath,
					role: 'page',
				}),
			],
		]);

		expect(isRegisteredScriptEntrypoint(registered, scriptPath)).toBe(true);
		expect(isRegisteredScriptEntrypoint(registered, pagePath)).toBe(false);
	});

	it('normalizes registered entrypoint paths before matching', () => {
		const registered = new Map([
			[
				'/app/src/components/counter.ts',
				createRegisteredEntrypoint({
					sourcePath: '/app/src/components/counter.ts',
					role: 'script',
				}),
			],
		]);

		expect(isRegisteredScriptEntrypoint(registered, '/app/src/components/../components/counter.ts')).toBe(true);
	});
});

describe('isHmrOutputFresh', () => {
	it('returns true when output mtime is newer than source mtime', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hmr-fresh-'));
		const sourcePath = path.join(root, 'widget.tsx');
		const outputPath = path.join(root, 'widget.js');

		fs.writeFileSync(sourcePath, 'source');
		fs.writeFileSync(outputPath, 'output');

		const sourceMtime = new Date(Date.now() - 1_000);
		fs.utimesSync(sourcePath, sourceMtime, sourceMtime);

		expect(isHmrOutputFresh(outputPath, sourcePath)).toBe(true);

		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe('isHmrOutputOlderThanSource', () => {
	it('returns false when the output file is missing', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hmr-stale-'));
		const sourcePath = path.join(root, 'widget.tsx');
		const outputPath = path.join(root, 'widget.js');

		fs.writeFileSync(sourcePath, 'source');

		expect(isHmrOutputOlderThanSource(outputPath, sourcePath)).toBe(false);

		fs.rmSync(root, { recursive: true, force: true });
	});

	it('returns true when output mtime is older than source mtime', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hmr-stale-'));
		const sourcePath = path.join(root, 'widget.tsx');
		const outputPath = path.join(root, 'widget.js');

		fs.writeFileSync(sourcePath, 'source');
		fs.writeFileSync(outputPath, 'output');

		const outputMtime = new Date(Date.now() - 1_000);
		fs.utimesSync(outputPath, outputMtime, outputMtime);

		expect(isHmrOutputOlderThanSource(outputPath, sourcePath)).toBe(true);

		fs.rmSync(root, { recursive: true, force: true });
	});
});
