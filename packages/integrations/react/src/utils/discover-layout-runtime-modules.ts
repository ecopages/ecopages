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

function isEcoLayoutSource(source: string): boolean {
	return /\beco\.layout\s*\(/.test(source);
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

	return false;
}

function collectLayoutEntryFiles(searchDir: string, extensions: readonly string[], files: string[]): void {
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
			if (isEcoLayoutSource(source)) {
				files.push(entryPath);
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

	for (const specifier of reachability.reachableImports.keys()) {
		if (options.projectRoot) {
			const resolvedLocalModule = resolveProjectModulePath(options.projectRoot, filePath, specifier);
			if (resolvedLocalModule) {
				options.queue.push(resolvedLocalModule);
				continue;
			}
		}

		if (
			!isBarePackageImportSpecifier(specifier, options.projectRoot) ||
			shouldExcludeAutoRuntimeSpecifier(specifier, options)
		) {
			continue;
		}

		options.discovered.add(normalizeRuntimePackageSpecifier(specifier));
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
	const entryFiles: string[] = [];

	for (const searchDir of options.searchDirs) {
		collectLayoutEntryFiles(searchDir, extensions, entryFiles);
	}

	const discovered = new Set<string>();
	const visitedFiles = new Set<string>();
	const queue = [...entryFiles];

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

	return [...discovered].sort();
}
