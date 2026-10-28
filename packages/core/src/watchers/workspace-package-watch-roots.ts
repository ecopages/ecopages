import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { isPathStrictlyInside } from '../utils/path-containment.ts';

type PackageManifest = {
	dependencies?: Record<string, unknown>;
	devDependencies?: Record<string, unknown>;
	optionalDependencies?: Record<string, unknown>;
};

/**
 * @remarks
 * Resolve linked direct and transitive dependencies, including development
 * and optional ones. The Project Watcher activates each root only after a
 * recorded build input lies inside it. Resolve installed directories rather
 * than package exports: a package need not expose its root entry or package.json.
 */
export function resolveWorkspacePackageWatchRoots(rootDir: string): string[] {
	const roots = new Set<string>();
	const visitedPackages = new Set<string>();
	const pendingPackages = [path.resolve(rootDir)];

	while (pendingPackages.length > 0) {
		const packageRoot = pendingPackages.pop();
		if (!packageRoot || visitedPackages.has(packageRoot)) continue;
		visitedPackages.add(packageRoot);
		for (const name of getDeclaredDependencies(packageRoot)) {
			const linkedRoot = resolveInstalledPackageRoot(packageRoot, name);
			if (!linkedRoot) continue;
			roots.add(linkedRoot);
			if (!visitedPackages.has(linkedRoot)) pendingPackages.push(linkedRoot);
		}
	}

	return [...roots];
}

function getDeclaredDependencies(packageRoot: string): Set<string> {
	const manifestPath = path.join(packageRoot, 'package.json');
	if (!fileSystem.exists(manifestPath)) return new Set();
	const manifest: PackageManifest = JSON.parse(fileSystem.readFileSync(manifestPath));
	return new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.devDependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
	]);
}

function resolveInstalledPackageRoot(packageRoot: string, name: string): string | undefined {
	if (!/^(?:@[^/]+\/)?[^/]+$/u.test(name) || name.startsWith('.')) return undefined;
	let directory = path.resolve(packageRoot);
	while (true) {
		const installed = path.join(directory, 'node_modules', name);
		if (fileSystem.exists(path.join(installed, 'package.json'))) {
			const realRoot = fileSystem.realpath(installed);
			return realRoot.split(path.sep).includes('node_modules') ? undefined : realRoot;
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

export function isWorkspacePackageFile(filePath: string, roots: readonly string[]): boolean {
	return roots.some((root) => isPathStrictlyInside(filePath, root));
}
