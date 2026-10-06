import { readFileSync } from 'node:fs';
import path from 'node:path';

const appDeclaredPackageCache = new Map<string, Set<string>>();
const appWorkspacePackageCache = new Map<string, Set<string>>();

export function getPackageNameFromSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) {
		return specifier.split('/').slice(0, 2).join('/');
	}

	return specifier.split('/')[0] ?? specifier;
}

function getDeclaredAppPackages(rootDir: string): Set<string> {
	const cacheKey = path.resolve(rootDir);
	const cached = appDeclaredPackageCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const packageJsonPath = path.resolve(rootDir, 'package.json');
	const declaredPackages = new Set<string>();

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') {
				continue;
			}

			for (const packageName of Object.keys(entries as Record<string, unknown>)) {
				declaredPackages.add(packageName);
			}
		}
	} catch {
		appDeclaredPackageCache.set(cacheKey, declaredPackages);
		return declaredPackages;
	}

	appDeclaredPackageCache.set(cacheKey, declaredPackages);
	return declaredPackages;
}

/**
 * Returns the set of workspace packages declared in the app's package.json.
 *
 * Workspace packages are identified by the `workspace:` protocol in their
 * version specifier (e.g., `"workspace:*"`, `"workspace:^1.0.0"`). These
 * packages are typically source-only and must be bundled rather than
 * externalized.
 */
function getWorkspacePackages(rootDir: string): Set<string> {
	const cacheKey = path.resolve(rootDir);
	const cached = appWorkspacePackageCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const packageJsonPath = path.resolve(rootDir, 'package.json');
	const workspacePackages = new Set<string>();

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') {
				continue;
			}

			for (const [packageName, version] of Object.entries(entries as Record<string, unknown>)) {
				if (typeof version === 'string' && version.startsWith('workspace:')) {
					workspacePackages.add(packageName);
				}
			}
		}
	} catch {
		appWorkspacePackageCache.set(cacheKey, workspacePackages);
		return workspacePackages;
	}

	appWorkspacePackageCache.set(cacheKey, workspacePackages);
	return workspacePackages;
}

/**
 * Returns true if the given specifier is a workspace package.
 *
 * Workspace packages are declared with the `workspace:` protocol and are
 * typically source-only, requiring bundling rather than externalization.
 */
export function isWorkspacePackageImport(specifier: string, rootDir: string): boolean {
	return getWorkspacePackages(rootDir).has(getPackageNameFromSpecifier(specifier));
}

export function isDeclaredAppPackageImport(specifier: string, rootDir: string): boolean {
	return getDeclaredAppPackages(rootDir).has(getPackageNameFromSpecifier(specifier));
}
