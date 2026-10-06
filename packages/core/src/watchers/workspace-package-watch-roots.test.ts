import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { resolveWorkspacePackageWatchRoots, isWorkspacePackageFile } from './workspace-package-watch-roots.ts';
import { createProjectWatcherIgnorePredicate } from './project-watcher-ignore.ts';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('resolves hoisted linked dependencies with subpath-only exports and deduplicates aliases', () => {
	const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-workspace-roots-')));
	roots.push(root);
	const app = path.join(root, 'app');
	const linked = path.join(root, 'linked');
	mkdirSync(app);
	mkdirSync(linked);
	mkdirSync(path.join(root, 'node_modules'));
	writeFileSync(path.join(linked, 'package.json'), JSON.stringify({ exports: { './button': './button.js' } }));
	symlinkSync(linked, path.join(root, 'node_modules/ui'), 'dir');
	symlinkSync(linked, path.join(root, 'node_modules/alias'), 'dir');
	mkdirSync(path.join(root, 'node_modules/installed'));
	writeFileSync(path.join(root, 'node_modules/installed/package.json'), '{}');
	writeFileSync(
		path.join(app, 'package.json'),
		JSON.stringify({
			dependencies: { ui: 'workspace:*', installed: '1' },
			devDependencies: { alias: 'link:../linked' },
			optionalDependencies: { missing: '1' },
		}),
	);
	expect(resolveWorkspacePackageWatchRoots(app)).toEqual([linked]);
	expect(isWorkspacePackageFile(path.join(linked, 'src/button.ts'), [linked])).toBe(true);
	expect(isWorkspacePackageFile(path.join(root, 'linked-other/button.ts'), [linked])).toBe(false);
	const ignored = createProjectWatcherIgnorePredicate(
		{ workDir: path.join(app, '.eco'), distDir: path.join(app, 'dist') },
		[linked],
	);
	expect(ignored(path.join(linked, 'src/button.ts'))).toBe(false);
	expect(ignored(path.join(linked, '.cache/output.js'))).toBe(true);
	expect(ignored(path.join(linked, 'src/.generated.ts'))).toBe(true);
	expect(ignored(path.join(linked, 'node_modules/dep/index.js'))).toBe(true);
	expect(ignored(path.join(app, '.env'))).toBe(false);
});

test('allows projects without a manifest', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'eco-workspace-empty-'));
	roots.push(root);
	expect(resolveWorkspacePackageWatchRoots(root)).toEqual([]);
});
