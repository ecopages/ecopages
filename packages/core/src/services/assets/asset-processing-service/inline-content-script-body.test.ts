import { fileSystem } from '@ecopages/file-system';
import { afterEach, expect, test, vi } from 'vitest';
import { resolveInlineContentScriptBody } from './inline-content-script-body.ts';
import type { ContentScriptAsset } from './assets.types.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

function createDep(overrides: Partial<ContentScriptAsset> = {}): ContentScriptAsset {
	return {
		kind: 'script',
		source: 'content',
		content: 'import "./authoring.js";',
		inline: true,
		bundle: true,
		...overrides,
	};
}

test('resolveInlineContentScriptBody returns undefined for external scripts', () => {
	expect(resolveInlineContentScriptBody(createDep({ inline: false }), '/dist/bootstrap.js')).toBeUndefined();
});

test('resolveInlineContentScriptBody reads bundled output when inline bundling ran', () => {
	vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
	vi.spyOn(fileSystem, 'readFileSync').mockReturnValue('console.log("bundled")');

	expect(resolveInlineContentScriptBody(createDep(), '/dist/bootstrap.js')).toBe('console.log("bundled")');
});

test('resolveInlineContentScriptBody uses declaration source for inline unbundled scripts', () => {
	vi.spyOn(fileSystem, 'exists').mockReturnValue(true);

	expect(
		resolveInlineContentScriptBody(
			createDep({ bundle: false, content: 'console.log("raw")' }),
			'/dist/bootstrap.js',
		),
	).toBe('console.log("raw")');
});

test('resolveInlineContentScriptBody falls back to declaration source when bundled output is missing', () => {
	vi.spyOn(fileSystem, 'exists').mockReturnValue(false);

	expect(resolveInlineContentScriptBody(createDep(), '/dist/bootstrap.js')).toBe('import "./authoring.js";');
});
