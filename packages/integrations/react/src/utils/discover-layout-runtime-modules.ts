/**
 * Discovers npm packages reachable from persisted `eco.layout()` client graphs.
 *
 * @module
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
	isBarePackageImportSpecifier,
	resolveProjectModulePath,
} from '@ecopages/core/plugins/tsconfig-import-resolver';
import { analyzeReachability } from './reachability-analyzer.ts';
import { REACT_RUNTIME_SPECIFIERS } from './react-runtime-alias-map.ts';

const MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs'] as const;

const AUTO_RUNTIME_EXCLUDED_SPECIFIERS = new Set<string>([
	...REACT_RUNTIME_SPECIFIERS,
	'react-dom/client',
	'use-sync-external-store/shim',
	'use-sync-external-store/shim/index.js',
	'use-sync-external-store/shim/with-selector',
	'use-sync-external-store/shim/with-selector.js',
]);

const AUTO_RUNTIME_EXCLUDED_PACKAGE_PREFIXES = ['@ecopages/', '@techn.es/'] as const;

const PROVIDER_MODULE_PATH_PATTERN =
	/(?:^|[/\\])(?:[^/\\]*provider[^/\\]*|[^/\\]*context[^/\\]*)\.(?:tsx?|jsx?|mts?|mjs)$/i;

const PROVIDER_MODULE_SOURCE_PATTERN = /\b(?:QueryClientProvider|(?:\w+Provider)|createContext|Context\.Provider)\b/;

function isServerModulePath(filePath: string): boolean {
	return /\.server\.(?:tsx?|jsx?|mts?|mjs|cjs)$/.test(filePath);
}

function isAutoRuntimeExcludedPackage(specifier: string): boolean {
	return AUTO_RUNTIME_EXCLUDED_PACKAGE_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}

function isEcoLayoutSource(source: string): boolean {
	return /\beco\.layout(?:<[^>]*>)?\s*\(/.test(source);
}

/**
 * Returns true when a layout opts into runtime-provider auto-vendoring discovery.
 */
export function isRuntimeProviderLayoutSource(source: string): boolean {
	return isEcoLayoutSource(source) && /\bruntimeProvider\s*:\s*true\b/.test(source);
}

/**
 * Returns true when a module looks like it mounts shared client runtime state
 * (React context providers, query clients, etc.).
 */
export function isProviderRuntimeModulePath(filePath: string, source: string): boolean {
	if (PROVIDER_MODULE_PATH_PATTERN.test(filePath)) {
		return true;
	}

	return PROVIDER_MODULE_SOURCE_PATTERN.test(source);
}

/**
 * Normalizes import specifiers to the package entry used for browser vendors.
 */
export function normalizeRuntimePackageSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) {
		const parts = specifier.split('/');
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`;
		}

		return specifier;
	}

	return specifier.split('/')[0] ?? specifier;
}

function shouldExcludeAutoRuntimeSpecifier(specifier: string, options: { routerImportPath?: string }): boolean {
	if (AUTO_RUNTIME_EXCLUDED_SPECIFIERS.has(specifier)) {
		return true;
	}

	if (options.routerImportPath && specifier === options.routerImportPath) {
		return true;
	}

	if (specifier.startsWith('@ecopages/')) {
		return true;
	}

	const packageRoot = normalizeRuntimePackageSpecifier(specifier);
	if (packageRoot.endsWith('-devtools')) {
		return true;
	}

	return false;
}

function collectLayoutEntryFiles(
	searchDir: string,
	extensions: readonly string[],
	files: { all: string[]; runtimeProvider: string[] },
): void {
	if (!existsSync(searchDir)) {
		return;
	}

	for (const entry of readdirSync(searchDir, { withFileTypes: true })) {
		const entryPath = path.join(searchDir, entry.name);
		if (entry.isDirectory()) {
			collectLayoutEntryFiles(entryPath, extensions, files);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		if (!extensions.some((extension) => entry.name.endsWith(extension))) {
			continue;
		}

		try {
			const source = readFileSync(entryPath, 'utf8');
			if (!isEcoLayoutSource(source)) {
				continue;
			}

			files.all.push(entryPath);
			if (isRuntimeProviderLayoutSource(source)) {
				files.runtimeProvider.push(entryPath);
			}
		} catch {
			continue;
		}
	}
}

function collectReachableNpmSpecifiersFromFile(
	filePath: string,
	options: {
		projectRoot?: string;
		routerImportPath?: string;
		visitedFiles: Set<string>;
		queue: string[];
		discovered: Set<string>;
	},
): void {
	if (isServerModulePath(filePath)) {
		return;
	}

	if (options.visitedFiles.has(filePath)) {
		return;
	}

	options.visitedFiles.add(filePath);

	let source: string;
	try {
		source = readFileSync(filePath, 'utf8');
	} catch {
		return;
	}

	const reachability = analyzeReachability(source, filePath);
	if (!reachability.analyzed) {
		return;
	}

	const collectNpmFromModule = isProviderRuntimeModulePath(filePath, source);

	for (const specifier of reachability.reachableImports.keys()) {
		if (options.projectRoot) {
			const resolvedLocalModule = resolveProjectModulePath(options.projectRoot, filePath, specifier);
			if (resolvedLocalModule) {
				options.queue.push(resolvedLocalModule);
				continue;
			}
		}

		if (!collectNpmFromModule) {
			continue;
		}

		if (
			!isBarePackageImportSpecifier(specifier, options.projectRoot) ||
			shouldExcludeAutoRuntimeSpecifier(specifier, options) ||
			isAutoRuntimeExcludedPackage(normalizeRuntimePackageSpecifier(specifier))
		) {
			continue;
		}

		const packageRoot = normalizeRuntimePackageSpecifier(specifier);
		options.discovered.add(packageRoot);
	}
}

/**
 * Finds npm packages imported from persisted layout client graphs under the given directories.
 */
export function discoverLayoutRuntimeModuleSpecifiers(options: {
	searchDirs: string[];
	projectRoot?: string;
	extensions?: readonly string[];
	routerImportPath?: string;
}): string[] {
	const extensions = options.extensions ?? MODULE_EXTENSIONS;
	const layoutEntries = { all: [] as string[], runtimeProvider: [] as string[] };

	for (const searchDir of options.searchDirs) {
		collectLayoutEntryFiles(searchDir, extensions, layoutEntries);
	}

	const entryFiles = layoutEntries.runtimeProvider.length > 0 ? layoutEntries.runtimeProvider : layoutEntries.all;
	const discovered = new Set<string>();

	for (const entryFile of entryFiles) {
		const visitedFiles = new Set<string>();
		const queue = [entryFile];

		while (queue.length > 0) {
			const filePath = queue.shift();
			if (!filePath) {
				continue;
			}

			collectReachableNpmSpecifiersFromFile(filePath, {
				projectRoot: options.projectRoot,
				routerImportPath: options.routerImportPath,
				visitedFiles,
				queue,
				discovered,
			});
		}
	}

	return [...discovered].sort();
}
