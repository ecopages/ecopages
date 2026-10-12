import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	matchesAdditionalWatchPath,
	mayContainAdditionalWatchMatches,
	resolveAdditionalWatchPath,
} from './additional-watch-paths.ts';

const nodeMatchesGlob = path.matchesGlob;

/**
 * Stands in for a `path.matchesGlob` that lets `*` and `**` match segments starting with `.`, as Bun's does.
 */
function matchesGlobIncludingDotSegments(filePath: string, pattern: string): boolean {
	const hideLeadingDots = (value: string) => value.replace(/(^|\/)\./g, '$1_');
	return nodeMatchesGlob(hideLeadingDots(filePath), hideLeadingDots(pattern));
}

describe('additionalWatchPaths dot segments with a glob matcher that matches them', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		['**/*.md', '/test/project/.cache/intro.md', false],
		['**/*.md', '/test/project/docs/.draft.md', false],
		['.github/**/*.yml', '/test/project/.github/workflows/ci.yml', true],
	])('%s matching %s is %s', (pattern, filePath, expected) => {
		vi.spyOn(path, 'matchesGlob').mockImplementation(matchesGlobIncludingDotSegments);
		expect(path.matchesGlob('.cache/intro.md', '**/*.md')).toBe(true);

		expect(matchesAdditionalWatchPath(filePath, resolveAdditionalWatchPath(pattern, '/test/project'))).toBe(
			expected,
		);
	});

	it('does not descend into a dot directory the glob does not name', () => {
		vi.spyOn(path, 'matchesGlob').mockImplementation(matchesGlobIncludingDotSegments);
		const watchPath = resolveAdditionalWatchPath('**/*.md', '/test/project');

		expect(mayContainAdditionalWatchMatches('/test/project/.cache', watchPath)).toBe(false);
		expect(mayContainAdditionalWatchMatches('/test/project/docs', watchPath)).toBe(true);
	});
});
