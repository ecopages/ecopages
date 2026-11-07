import { describe, expect, it } from 'vitest';
import { path } from '@ecopages/file-system/path';
import {
	encodeHmrDynamicSegments,
	isRegisteredDevTransformEntrypoint,
	isRegisteredScriptEntrypoint,
} from './hmr-entrypoint-output.ts';
import type { ResolvedHmrEntrypoint } from '../types/contracts.ts';

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

describe('encodeHmrDynamicSegments', () => {
	it('encodes dynamic route segments in output paths', () => {
		expect(encodeHmrDynamicSegments('pages/blog/[slug]')).toBe('pages/blog/_slug_');
	});
});

describe('isRegisteredDevTransformEntrypoint', () => {
	it('matches paths registered in the HMR entrypoint map', () => {
		const entrypoint = path.resolve('/app/src/components/theme-toggle.tsx');
		const registered = new Map([
			[
				entrypoint,
				createRegisteredEntrypoint({
					sourcePath: entrypoint,
					outputUrl: '/assets/__eco_dev__/components/theme-toggle.js',
				}),
			],
		]);

		expect(isRegisteredDevTransformEntrypoint(registered, entrypoint)).toBe(true);
		expect(isRegisteredDevTransformEntrypoint(registered, path.resolve('/app/src/components/other.tsx'))).toBe(
			false,
		);
	});
});

describe('isRegisteredScriptEntrypoint', () => {
	it('matches only script-role registrations', () => {
		const scriptPath = path.resolve('/app/src/layouts/base-layout/base-layout.ts');
		const pagePath = path.resolve('/app/src/pages/index.tsx');
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
				path.resolve('/app/src/components/counter.ts'),
				createRegisteredEntrypoint({
					sourcePath: path.resolve('/app/src/components/counter.ts'),
					role: 'script',
				}),
			],
		]);

		expect(isRegisteredScriptEntrypoint(registered, '/app/src/components/../components/counter.ts')).toBe(true);
	});
});
