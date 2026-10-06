import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectWatcherIgnorePredicate } from './project-watcher-ignore.ts';

describe('createProjectWatcherIgnorePredicate', () => {
	const absolutePaths = {
		workDir: '/project/.eco-cross-integration-dev',
		distDir: '/project/dist-cross-integration-dev',
	};
	const ignored = createProjectWatcherIgnorePredicate(absolutePaths);

	it('ignores node_modules, .git, workDir, and distDir descendants', () => {
		expect(ignored(path.join('/project/src/node_modules/react/index.js'))).toBe(true);
		expect(ignored(path.join('/project/.git', 'HEAD'))).toBe(true);
		expect(ignored(absolutePaths.workDir)).toBe(true);
		expect(ignored(path.join(absolutePaths.distDir, 'index.html'))).toBe(true);
		expect(ignored(path.join('/project/src/components/Button.tsx'))).toBe(false);
	});
});

/**
 * @remarks
 * Loads the watcher path helpers with `node:path` swapped for `path.win32`, so the Windows logic runs on
 * any OS. chokidar hands `ignored` forward-slash paths on Windows too.
 */
describe('watcher path checks with Windows paths', () => {
	async function importWithWin32Path() {
		vi.resetModules();
		vi.doMock('node:path', async (importOriginal) => {
			const { win32 } = await importOriginal<typeof import('node:path')>();
			return { ...win32, default: win32 };
		});
		return {
			...(await import('./project-watcher-ignore.ts')),
			...(await import('../utils/additional-watch-paths.ts')),
		};
	}

	afterEach(() => {
		vi.doUnmock('node:path');
		vi.resetModules();
	});

	it('ignores forward-slash paths under node_modules, .git, workDir and distDir', async () => {
		const { createProjectWatcherIgnorePredicate } = await importWithWin32Path();
		const ignored = createProjectWatcherIgnorePredicate({
			workDir: 'C:\\project\\.eco',
			distDir: 'C:\\project\\dist',
		});

		expect(ignored('C:/project/node_modules/react/index.js')).toBe(true);
		expect(ignored('C:/project/.git/HEAD')).toBe(true);
		expect(ignored('C:/project/.eco')).toBe(true);
		expect(ignored('C:/project/dist/index.html')).toBe(true);
		expect(ignored('C:/project/dist-other/index.html')).toBe(false);
		expect(ignored('C:/project/src/components/Button.tsx')).toBe(false);
	});

	it('splits a backslash glob at its first wildcard segment', async () => {
		const { matchesAdditionalWatchPath, resolveAdditionalWatchPath } = await importWithWin32Path();
		const watchPath = resolveAdditionalWatchPath('content\\**\\*.md', 'C:\\project');

		expect(watchPath).toEqual({ base: 'C:\\project\\content', glob: '**/*.md' });
		expect(matchesAdditionalWatchPath('C:/project/content/blog/post.md', watchPath)).toBe(true);
		expect(matchesAdditionalWatchPath('C:/project/docs/post.md', watchPath)).toBe(false);
	});
});
