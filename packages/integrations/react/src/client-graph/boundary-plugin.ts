/**
 * @module ClientGraphBoundaryPlugin
 *
 * Build plugin securing the Ecopages isomorphic compilation pipeline.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EcoBuildOnLoadArgs, EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { RequestedExportRules } from './specifier-classification.ts';
import { parseDeclaredModules, toModuleBaseSpecifier } from './specifier-classification.ts';
import { classifyClientGraphModule } from './module-classification.ts';
import { transformClientGraphModule } from './boundary-plugin-transform.ts';

const SOURCE_FILE_FILTER = /\.(tsx?|jsx?)$/;

/**
 * Shares transitive export reachability among boundary plugins in one grouped build.
 *
 * @remarks
 * Grouped entries load one shared copy of each helper, so every entry's root analysis
 * must be visible to whichever boundary plugin transforms that helper first.
 */
const groupedRequestedExports = new WeakMap<readonly string[], Map<string, RequestedExportRules>>();

function getRequestedExports(groupedEntrypointFiles?: readonly string[]): Map<string, RequestedExportRules> {
	if (!groupedEntrypointFiles) {
		return new Map();
	}

	const existing = groupedRequestedExports.get(groupedEntrypointFiles);
	if (existing) {
		return existing;
	}

	const requestedExports = new Map<string, RequestedExportRules>();
	groupedRequestedExports.set(groupedEntrypointFiles, requestedExports);
	return requestedExports;
}

/**
 * Configuration options for the Client Graph Boundary build plugin.
 */
type ClientGraphBoundaryOptions = {
	projectRoot?: string;
	absWorkingDir?: string;
	entrypointFile?: string;
	groupedEntrypointFiles?: readonly string[];
	groupedDeclaredModules?: readonly string[];
	declaredModules?: readonly string[];
	alwaysAllowSpecifiers?: string[];
};

type NormalizedClientGraphBoundaryOptions = {
	absWorkingDir: string;
	projectRoot?: string;
	entrypointFile?: string;
	groupedEntrypointFiles: Set<string>;
	declaredModules: string[];
	groupedDeclaredModules: string[];
	alwaysAllowSpecifiers: string[];
	cacheKey: string;
};

function normalizeClientGraphBoundaryOptions(
	options?: ClientGraphBoundaryOptions,
): NormalizedClientGraphBoundaryOptions {
	const absWorkingDir = path.resolve(options?.absWorkingDir ?? process.cwd());
	const projectRoot = options?.projectRoot ? path.resolve(absWorkingDir, options.projectRoot) : undefined;
	const entrypointFile = options?.entrypointFile ? path.resolve(absWorkingDir, options.entrypointFile) : undefined;
	const groupedEntrypointFiles = new Set(
		[entrypointFile, ...(options?.groupedEntrypointFiles ?? [])]
			.filter((filePath): filePath is string => filePath !== undefined)
			.map((filePath) => path.resolve(absWorkingDir, filePath)),
	);
	const declaredModules = [...(options?.declaredModules ?? [])];
	const groupedDeclaredModules = [...(options?.groupedDeclaredModules ?? declaredModules)];
	const alwaysAllowSpecifiers = [...(options?.alwaysAllowSpecifiers ?? [])];
	const cacheKey = JSON.stringify({
		projectRoot,
		absWorkingDir,
		entrypointFile,
		groupedEntrypointFiles: [...groupedEntrypointFiles].sort(),
		groupedDeclaredModules: [...groupedDeclaredModules].sort(),
		declaredModules: [...declaredModules].sort(),
		alwaysAllowSpecifiers: [...alwaysAllowSpecifiers].sort(),
	});

	return {
		absWorkingDir,
		projectRoot,
		entrypointFile,
		groupedEntrypointFiles,
		groupedDeclaredModules,
		declaredModules,
		alwaysAllowSpecifiers,
		cacheKey,
	};
}

function loadClientGraphBoundaryModule(
	args: EcoBuildOnLoadArgs,
	options: NormalizedClientGraphBoundaryOptions,
	requestedExports: Map<string, RequestedExportRules>,
) {
	const sourcePath = path.resolve(options.absWorkingDir, args.path);
	if (
		options.entrypointFile &&
		options.groupedEntrypointFiles.has(sourcePath) &&
		sourcePath !== options.entrypointFile
	) {
		return undefined;
	}

	const sourceDeclarations =
		options.entrypointFile && options.groupedEntrypointFiles.has(sourcePath)
			? options.declaredModules
			: options.groupedDeclaredModules;
	const globallyDeclaredSources = parseDeclaredModules(sourceDeclarations);
	for (const alwaysAllow of options.alwaysAllowSpecifiers) {
		globallyDeclaredSources.set(toModuleBaseSpecifier(alwaysAllow), '*');
	}
	const category = classifyClientGraphModule(args.path, options.projectRoot);
	if (category === 'package' || category === 'vendored' || category === 'virtual') {
		return undefined;
	}

	let source: string;
	try {
		source = readFileSync(args.path, 'utf-8');
	} catch {
		return undefined;
	}

	return transformClientGraphModule({
		filePath: args.path,
		source,
		absWorkingDir: options.absWorkingDir,
		category,
		globallyDeclaredSources,
		requestedExports,
	});
}

/**
 * Instantiates the client graph boundary build plugin.
 */
export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	const normalizedOptions = normalizeClientGraphBoundaryOptions(options);
	const requestedExports = getRequestedExports(options?.groupedEntrypointFiles);

	return {
		name: 'ecopages-client-graph-boundary',
		cacheKey: normalizedOptions.cacheKey,
		setup(build) {
			build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) =>
				loadClientGraphBoundaryModule(args, normalizedOptions, requestedExports),
			);
		},
	};
}
