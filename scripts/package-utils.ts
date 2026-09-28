import path from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const skippedPackageWalkDirectories = new Set(['node_modules', 'dist', '__fixtures__']);

export type PackageNameManifest = {
	name: string;
};

export type PublishablePackageManifest = {
	private?: boolean;
};

export type WorkspaceDependencyManifest = PackageNameManifest & {
	version?: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

export function readJsonFile<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function toPosix(filePath: string): string {
	return filePath.replaceAll(path.sep, '/');
}

/**
 * @remarks
 * Fixture apps under `__fixtures__` are skipped even when they omit `"private": true`.
 */
export function isPublishablePackageManifest(packageJsonPath: string, manifest: PublishablePackageManifest): boolean {
	if (packageJsonPath.includes(`${path.sep}__fixtures__${path.sep}`)) {
		return false;
	}

	return !manifest.private;
}

/**
 * Walks a packages tree and returns directories whose manifest is public and not a fixture.
 */
export function findPublishablePackageDirs(dir: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (skippedPackageWalkDirectories.has(entry.name)) {
			continue;
		}

		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findPublishablePackageDirs(fullPath));
			continue;
		}

		if (entry.name !== 'package.json') {
			continue;
		}

		const manifest = readJsonFile<PublishablePackageManifest>(fullPath);
		if (isPublishablePackageManifest(fullPath, manifest)) {
			results.push(path.dirname(fullPath));
		}
	}

	return results;
}

/**
 * Rewrites `workspace:*` dependency ranges to a concrete publish version.
 */
export function rewriteWorkspaceRanges(
	record: Record<string, string> | undefined,
	version: string,
): Record<string, string> | undefined {
	if (!record) {
		return record;
	}

	return Object.fromEntries(
		Object.entries(record).map(([name, range]) => [name, range === 'workspace:*' ? version : range]),
	);
}
