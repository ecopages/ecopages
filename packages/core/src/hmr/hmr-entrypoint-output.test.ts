import { describe, expect, it } from 'vitest';
import {
	encodeHmrDynamicSegments,
	isRegisteredDevTransformEntrypoint,
	isRegisteredScriptEntrypoint,
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

describe('encodeHmrDynamicSegments', () => {
	it('encodes dynamic route segments in output paths', () => {
		expect(encodeHmrDynamicSegments('pages/blog/[slug]')).toBe('pages/blog/_slug_');
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
					outputUrl: '/assets/__eco_dev__/components/theme-toggle.js',
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
