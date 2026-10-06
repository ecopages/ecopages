import { describe, expect, it } from 'vitest';
import { matchesAdditionalWatchPath, resolveAdditionalWatchPath } from './additional-watch-paths.ts';

/**
 * Bun's `path.matchesGlob` lets `*` and `**` match dot segments, unlike Node's. Runs only in the
 * `bun-adapter` Vitest project, i.e. when Vitest itself runs on Bun.
 */
describe('additionalWatchPaths dot segments on Bun', () => {
	it.each([
		['**/*.md', '/test/project/.cache/intro.md', false],
		['**/*.md', '/test/project/docs/.draft.md', false],
		['.github/**/*.yml', '/test/project/.github/workflows/ci.yml', true],
	])('%s matching %s is %s', (pattern, filePath, expected) => {
		expect(matchesAdditionalWatchPath(filePath, resolveAdditionalWatchPath(pattern, '/test/project'))).toBe(
			expected,
		);
	});
});
