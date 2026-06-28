import path from 'node:path';
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { readJsonFile, type WorkspaceDependencyManifest } from './package-utils.ts';

export type BundleManifest = WorkspaceDependencyManifest;

/**
 * Returns every workspace package directory keyed by package name, including private packages.
 */
export function findAllPackageDirs(packagesRoot: string): Map<string, string> {
	const packageDirsByName = new Map<string, string>();

	const visit = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.jsr-publish') {
				continue;
			}

			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(fullPath);
				continue;
			}

			if (entry.name !== 'package.json') {
				continue;
			}

			const manifest = readJsonFile<BundleManifest>(fullPath);
			packageDirsByName.set(manifest.name, path.dirname(fullPath));
		}
	};

	visit(packagesRoot);
	return packageDirsByName;
}

/**
 * Reads npm's native `bundleDependencies` field from a package manifest.
 */
export function getBundleDependencyNames(manifest: BundleManifest): string[] {
	const field = manifest.bundleDependencies;
	if (!field || field === false) {
		return [];
	}

	if (field === true) {
		return Object.keys(manifest.dependencies ?? {});
	}

	return field;
}

export function getBundledDependencyDistPath(distDir: string, packageName: string): string {
	return path.join(distDir, 'node_modules', ...packageName.split('/'));
}

/**
 * Copies pre-built bundled workspace packages into a consumer dist `node_modules` tree.
 *
 * Transitive bundling is unsupported: bundled deps must not declare their own
 * `bundleDependencies`. Nested copies would land under the bundled package's dist,
 * but the consumer manifest would not list transitive names for npm pack.
 */
export function copyBundledDependenciesToDist(
	manifest: BundleManifest,
	distDir: string,
	packageDirsByName: Map<string, string>,
): void {
	for (const packageName of getBundleDependencyNames(manifest)) {
		const packageDir = packageDirsByName.get(packageName);
		if (!packageDir) {
			throw new Error(
				`${manifest.name} lists ${packageName} in bundleDependencies, but no workspace package was found.`,
			);
		}

		const sourceDistDir = path.join(packageDir, 'dist');
		const bundledManifestPath = path.join(sourceDistDir, 'package.json');
		if (!existsSync(bundledManifestPath)) {
			throw new Error(
				`${manifest.name} depends on bundled package ${packageName}, but ${bundledManifestPath} is missing. Build it first.`,
			);
		}

		const bundledManifest = readJsonFile<BundleManifest>(bundledManifestPath);
		if (getBundleDependencyNames(bundledManifest).length > 0) {
			throw new Error(
				`${packageName} declares bundleDependencies, but transitive bundling is not supported. Flatten bundled deps to the consumer manifest instead.`,
			);
		}

		const destination = getBundledDependencyDistPath(distDir, packageName);
		cpSync(sourceDistDir, destination, { recursive: true });
	}
}

export function assertBundledDependenciesInDist(manifest: BundleManifest, distDir: string): void {
	for (const packageName of getBundleDependencyNames(manifest)) {
		const bundledManifestPath = path.join(getBundledDependencyDistPath(distDir, packageName), 'package.json');
		if (!existsSync(bundledManifestPath)) {
			throw new Error(`${manifest.name} is missing bundled dependency ${packageName} at ${bundledManifestPath}.`);
		}
	}
}
