import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
