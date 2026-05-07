/**
 * Runtime bundle service for the JSX integration.
 *
 * Owns creation of browser runtime vendor assets, the import map specifier
 * mapping, and the build external plugin. Radiant sub-path specifiers are
 * derived at runtime from `@ecopages/radiant/package.json` exports so the
 * list stays in sync with whatever version is installed.
 *
 * @module
 */

import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { createRuntimeSpecifierAliasPlugin } from '@ecopages/core/build/runtime-specifier-alias-plugin';
import {
	buildBrowserRuntimeAssetUrl,
	createBrowserRuntimeScriptAsset,
	type AssetDefinition,
} from '@ecopages/core/services/asset-processing-service';

const VENDOR_FILE_NAMES = {
	jsx: 'ecopages-jsx-esm.js',
	radiant: 'ecopages-radiant-esm.js',
} as const;

export interface JsxRuntimeBundleServiceConfig {
	radiant: boolean;
	rootDir?: string;
}

type RadiantPackageJson = {
	exports?: Record<string, unknown>;
};

type BrowserRuntimeRadiantModule = {
	exportKey: string;
	modulePath: string;
};

function getNamedExportNamesFromModuleSource(source: string): string[] {
	const exportNames = new Set<string>();

	for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
		for (const specifier of match[1].split(',')) {
			const trimmedSpecifier = specifier.trim();

			if (!trimmedSpecifier) {
				continue;
			}

			const aliasMatch = trimmedSpecifier.match(/(?:.+\s+as\s+)?([A-Z_a-z$][\w$]*)$/);

			if (aliasMatch?.[1] && aliasMatch[1] !== 'default') {
				exportNames.add(aliasMatch[1]);
			}
		}
	}

	for (const match of source.matchAll(
		/export\s+(?:async\s+)?(?:const|function|class|let|var)\s+([A-Z_a-z$][\w$]*)/g,
	)) {
		if (match[1] !== 'default') {
			exportNames.add(match[1]);
		}
	}

	return [...exportNames].sort();
}

function isBrowserRuntimeRadiantSpecifier(exportKey: string): boolean {
	if (exportKey === '.' || exportKey.startsWith('./context/')) {
		return true;
	}

	if (exportKey === './controller-registry') {
		return true;
	}

	if (exportKey === './client/hydrator') {
		return true;
	}

	if (exportKey === './client/install-hydrator') {
		return true;
	}

	if (exportKey.startsWith('./decorators/') || exportKey.startsWith('./helpers/')) {
		return true;
	}

	return exportKey === './core/radiant-controller' || exportKey === './core/radiant-element';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readRadiantPackageJson(manifestPath: string): RadiantPackageJson {
	const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));

	if (!isObjectRecord(parsed)) {
		throw new Error(`Invalid package manifest at ${manifestPath}`);
	}

	if (parsed.exports !== undefined && !isObjectRecord(parsed.exports)) {
		throw new Error(`Invalid package exports in ${manifestPath}`);
	}

	return {
		exports: parsed.exports,
	};
}
function findPackageManifestPath(packageName: string): string {
	let currentDir = path.dirname(new URL(import.meta.url).pathname);

	while (true) {
		const candidatePath = path.join(currentDir, 'node_modules', packageName, 'package.json');
		if (existsSync(candidatePath)) {
			return candidatePath;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}

		currentDir = parentDir;
	}

	throw new Error(`Could not locate ${packageName}/package.json from ${import.meta.url}`);
}

export class JsxRuntimeBundleService {
	private readonly config: JsxRuntimeBundleServiceConfig;
	private cachedSpecifierMap: Record<string, string> | undefined;
	private cachedJsxEntryModulePath: string | undefined;
	private cachedRadiantEntryModulePath: string | undefined;

	constructor(config: JsxRuntimeBundleServiceConfig) {
		this.config = config;
	}

	setRootDir(rootDir: string | undefined): void {
		this.config.rootDir = rootDir;
	}

	/**
	 * Returns the build plugin that aliases JSX and Radiant runtime specifiers to
	 * their emitted browser vendor URLs.
	 *
	 * @remarks
	 * The returned plugin both externalizes the mapped specifiers during bundle
	 * resolution and exposes alias metadata so Ecopages can rewrite any emitted JS
	 * imports that still reference bare runtime specifiers.
	 */
	getBuildPlugin(): EcoBuildPlugin {
		return createRuntimeSpecifierAliasPlugin(this.getOrCreateSpecifierMap(), {
			name: 'ecopages-jsx-runtime-alias',
		})!;
	}

	/**
	 * Builds the bare-specifier-to-vendor-URL map for the browser import map.
	 *
	 * JSX sub-paths are always included. When `radiant` is enabled, radiant
	 * sub-paths are derived from `@ecopages/radiant/package.json` exports and
	 * the result is cached for the lifetime of this service instance.
	 */
	async getSpecifierMap(): Promise<Record<string, string>> {
		return this.getOrCreateSpecifierMap();
	}

	/**
	 * Builds the full list of vendor asset definitions: the import map inline
	 * assets plus one `createBrowserRuntimeScriptAsset` per vendor bundle.
	 */
	async getDependencies(): Promise<AssetDefinition[]> {
		const jsxEntryModulePath = await this.getOrCreateJsxEntryModulePath();

		const deps: AssetDefinition[] = [];

		deps.push(
			createBrowserRuntimeScriptAsset({
				importPath: jsxEntryModulePath,
				name: 'ecopages-jsx-esm',
				fileName: VENDOR_FILE_NAMES.jsx,
			}),
		);

		if (this.config.radiant) {
			const radiantEntryModulePath = await this.getOrCreateRadiantEntryModulePath();

			deps.push(
				createBrowserRuntimeScriptAsset({
					importPath: radiantEntryModulePath,
					name: 'ecopages-radiant-esm',
					fileName: VENDOR_FILE_NAMES.radiant,
				}),
			);
		}

		return deps;
	}

	private getArtifactsDir(): string {
		const rootDir = this.config.rootDir ?? process.cwd();
		return path.join(rootDir, 'node_modules', '.cache', 'ecopages-browser-runtime');
	}

	private getEntryImportPath(fromDir: string, targetPath: string): string {
		const relativeModulePath = path.relative(fromDir, targetPath).split(path.sep).join('/');
		return relativeModulePath.startsWith('.') ? relativeModulePath : `./${relativeModulePath}`;
	}

	private getOrCreateSpecifierMap(): Record<string, string> {
		if (this.cachedSpecifierMap) {
			return this.cachedSpecifierMap;
		}

		const jsxVendorUrl = buildBrowserRuntimeAssetUrl(VENDOR_FILE_NAMES.jsx);
		const specifierMap: Record<string, string> = {
			'@ecopages/jsx': jsxVendorUrl,
			'@ecopages/jsx/client': jsxVendorUrl,
			'@ecopages/jsx/jsx-runtime': jsxVendorUrl,
			'@ecopages/jsx/jsx-dev-runtime': jsxVendorUrl,
		};

		if (this.config.radiant) {
			const radiantVendorUrl = buildBrowserRuntimeAssetUrl(VENDOR_FILE_NAMES.radiant);
			const radiantPkg = readRadiantPackageJson(findPackageManifestPath('@ecopages/radiant'));

			for (const key of Object.keys(radiantPkg.exports ?? {})) {
				if (!isBrowserRuntimeRadiantSpecifier(key)) {
					continue;
				}

				const specifier = key === '.' ? '@ecopages/radiant' : `@ecopages/radiant${key.slice(1)}`;
				specifierMap[specifier] = radiantVendorUrl;
			}
		}

		this.cachedSpecifierMap = specifierMap;
		return specifierMap;
	}

	private async getOrCreateJsxEntryModulePath(): Promise<string> {
		if (this.cachedJsxEntryModulePath) {
			return this.cachedJsxEntryModulePath;
		}

		const artifactsDir = this.getArtifactsDir();
		const filePath = path.join(artifactsDir, 'ecopages-jsx-esm-entry.mjs');
		const manifestPath = findPackageManifestPath('@ecopages/jsx');
		const packageDir = path.dirname(realpathSync(manifestPath));
		const jsxPkg = readRadiantPackageJson(manifestPath);
		const jsxModulePath = this.resolvePackageExportModulePath(packageDir, '.', jsxPkg.exports?.['.']);
		const jsxRuntimeSource = readFileSync(jsxModulePath, 'utf8');

		mkdirSync(artifactsDir, { recursive: true });
		writeFileSync(filePath, jsxRuntimeSource, 'utf8');

		this.cachedJsxEntryModulePath = filePath;
		return filePath;
	}

	private getRadiantBrowserRuntimeModules(): BrowserRuntimeRadiantModule[] {
		const manifestPath = findPackageManifestPath('@ecopages/radiant');
		const packageDir = path.dirname(realpathSync(manifestPath));
		const radiantPkg = readRadiantPackageJson(manifestPath);

		return Object.entries(radiantPkg.exports ?? {})
			.filter(([key]) => isBrowserRuntimeRadiantSpecifier(key) && key !== '.')
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([exportKey, exportTarget]) => ({
				exportKey,
				modulePath: this.resolvePackageExportModulePath(packageDir, exportKey, exportTarget),
			}))
			.filter((module) => existsSync(module.modulePath));
	}

	private resolvePackageExportModulePath(packageDir: string, exportKey: string, exportTarget: unknown): string {
		if (typeof exportTarget === 'string') {
			return path.resolve(packageDir, exportTarget);
		}

		if (isObjectRecord(exportTarget) && 'import' in exportTarget) {
			const importTarget = exportTarget.import;

			if (typeof importTarget === 'string') {
				return path.resolve(packageDir, importTarget);
			}
		}

		throw new Error(`Missing import target for @ecopages/radiant export ${exportKey}`);
	}

	private async getOrCreateRadiantEntryModulePath(): Promise<string> {
		if (this.cachedRadiantEntryModulePath) {
			return this.cachedRadiantEntryModulePath;
		}

		const artifactsDir = this.getArtifactsDir();
		const filePath = path.join(artifactsDir, 'ecopages-radiant-esm-entry.mjs');
		const manifestPath = findPackageManifestPath('@ecopages/radiant');
		const packageDir = path.dirname(realpathSync(manifestPath));
		const radiantPkg = readRadiantPackageJson(manifestPath);
		const installHydratorModulePath = this.resolvePackageExportModulePath(
			packageDir,
			'./client/install-hydrator',
			radiantPkg.exports?.['./client/install-hydrator'],
		);
		const seenExports = new Set<string>();
		const statements: string[] = [`import '${this.getEntryImportPath(artifactsDir, installHydratorModulePath)}';`];

		mkdirSync(artifactsDir, { recursive: true });

		for (const module of this.getRadiantBrowserRuntimeModules()) {
			const exportNames = getNamedExportNamesFromModuleSource(readFileSync(module.modulePath, 'utf8'))
				.filter((name) => !seenExports.has(name))
				.filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name))
				.sort();

			if (exportNames.length === 0) {
				continue;
			}

			const entryImportPath = this.getEntryImportPath(artifactsDir, module.modulePath);

			statements.push(`export { ${exportNames.join(', ')} } from '${entryImportPath}';`);

			for (const exportName of exportNames) {
				seenExports.add(exportName);
			}
		}

		writeFileSync(filePath, statements.join('\n'), 'utf8');
		this.cachedRadiantEntryModulePath = filePath;
		return filePath;
	}
}
