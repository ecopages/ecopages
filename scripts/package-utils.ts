import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

export type PackageNameManifest = {
	name: string;
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
