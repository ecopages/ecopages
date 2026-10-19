import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { isPathStrictlyInside } from '../utils/path-containment.ts';

/**
 * @remarks
 * Watch declared direct dependencies, including development and optional ones,
 * so server-only imports and packages with subpath-only exports are covered
 * before the first browser request. Resolve the installed directory rather than
 * package exports: a package need not expose its root entry or package.json.
 */
export function resolveWorkspacePackageWatchRoots(rootDir: string): string[] {
	const manifestPath = path.join(rootDir, 'package.json');
	if (!fileSystem.exists(manifestPath)) return [];
	const manifest: {
		dependencies?: Record<string, unknown>;
		devDependencies?: Record<string, unknown>;
		optionalDependencies?: Record<string, unknown>;
	} = JSON.parse(fileSystem.readFileSync(manifestPath));
	const names = new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.devDependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
	]);
	const roots = new Set<string>();
	for (const name of names) {
		if (!/^(?:@[^/]+\/)?[^/]+$/u.test(name) || name.startsWith('.')) continue;
		let directory = path.resolve(rootDir);
		while (true) {
			const installed = path.join(directory, 'node_modules', name);
			if (fileSystem.exists(path.join(installed, 'package.json'))) {
				const realRoot = fileSystem.realpath(installed);
				if (!realRoot.split(path.sep).includes('node_modules')) roots.add(realRoot);
				break;
			}
			const parent = path.dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	}
	return [...roots];
}

export function isWorkspacePackageFile(filePath: string, roots: readonly string[]): boolean {
	return roots.some((root) => isPathStrictlyInside(filePath, root));
}
