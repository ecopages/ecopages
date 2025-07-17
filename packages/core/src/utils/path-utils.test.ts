import { describe, expect, test } from 'bun:test';
import { PathUtils } from './path-utils.module.ts';

describe('PathUtils', () => {
	test.each([
		['packages/core/src/utils/file-name-analyzer.ts', '.ts'],
		['packages/playground/src/pages/blog/author/%5Bid%5D.kita.tsx', '.kita.tsx'],
		['packages/core/src/component-utils/deps-manager.ts', '.ts'],
		['/packages/core/src/plugins/build-html-pages/build-html-pages.plugin.ts', '.plugin.ts'],
		['packages/core/src/ecopages.fake.descriptor.ts', '.descriptor.ts'],
	])('getEcoTemplateExtension: %p should return %p', (filePath, expected) => {
		const result = PathUtils.getEcoTemplateExtension(filePath);
		expect(result).toBe(expected);
	});
});
