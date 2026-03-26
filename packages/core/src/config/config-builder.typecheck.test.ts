import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

type PackageManifest = {
	name?: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

function readManifest(relativePath: string): PackageManifest {
	const manifestPath = path.resolve(import.meta.dirname, '../../../..', relativePath);
	return JSON.parse(readFileSync(manifestPath, 'utf-8')) as PackageManifest;
}

function resolveRepoPath(relativePath: string): string {
	return path.resolve(import.meta.dirname, '../../../..', relativePath);
}

function collectPackageManifestPaths(relativeDir: string): string[] {
	const dirPath = resolveRepoPath(relativeDir);
	if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
		return [];
	}

	return readdirSync(dirPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.posix.join(relativeDir, entry.name, 'package.json'));
}

function collectCorePeerPackagePaths(): string[] {
	const packagePaths = [
		...collectPackageManifestPaths('packages/integrations'),
		...collectPackageManifestPaths('packages/processors'),
		'packages/browser-router/package.json',
		'packages/react-router/package.json',
	];

	return packagePaths.filter((packagePath) => {
		const manifest = readManifest(packagePath);
		return manifest.name?.startsWith('@ecopages/') && !manifest.private;
	});
}

function collectTypeScriptFiles(dirPath: string): string[] {
	const results: string[] = [];

	const visit = (currentPath: string): void => {
		for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
			const fullPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				visit(fullPath);
				continue;
			}

			if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
				results.push(fullPath);
			}
		}
	};

	visit(dirPath);
	return results;
}

describe('ConfigBuilder published package compatibility', () => {
	test('public integrations and processors peer @ecopages/core', () => {
		const packages = collectCorePeerPackagePaths();
		expect(packages.length).toBeGreaterThan(0);

		for (const packagePath of packages) {
			const manifest = readManifest(packagePath);
			expect(manifest.peerDependencies?.['@ecopages/core'], packagePath).toBeDefined();
			expect(manifest.dependencies?.['@ecopages/core'], packagePath).toBeUndefined();
		}
	});

	test('built npm artifacts do not ship raw TypeScript sources', () => {
		const distDirs = [
			'packages/core/dist',
			'packages/integrations/react/dist',
			'packages/processors/postcss-processor/dist',
		];

		for (const relativeDistDir of distDirs) {
			const distDir = resolveRepoPath(relativeDistDir);
			if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
				continue;
			}

			expect(collectTypeScriptFiles(distDir), relativeDistDir).toEqual([]);
		}
	});
});
