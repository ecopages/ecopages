/**
 * @module ClientGraphBoundaryPlugin
 *
 * Build plugin securing the Ecopages isomorphic compilation pipeline.
 */

import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from '@ecopages/core/integration';
import type { RequestedExportRules } from './specifier-classification.ts';
import { parseDeclaredModules, toModuleBaseSpecifier } from './specifier-classification.ts';
import { classifyClientGraphModule } from './module-classification.ts';
import { transformClientGraphModule } from './boundary-plugin-transform.ts';
import { scanForeignJsxReach, toRealPath, type ForeignJsxReach } from './foreign-jsx-reach.ts';

const SOURCE_FILE_FILTER = /\.(tsx?|jsx?)$/;

/**
 * Shares transitive export reachability among boundary plugins in one grouped build.
 *
 * @remarks
 * Grouped entries load one shared copy of each helper, so every entry's root analysis
 * must be visible to whichever boundary plugin transforms that helper first.
 */
const groupedRequestedExports = new WeakMap<readonly string[], Map<string, RequestedExportRules>>();
const buildRequestedExports = new WeakMap<Readonly<Record<string, string>>, Map<string, RequestedExportRules>>();

type ClientGraphBoundaryBuildContext = {
	configs: NormalizedClientGraphBoundaryOptions[];
	entrypointFiles: Set<string>;
	requestedExports: Map<string, RequestedExportRules>;
	foreignJsxReach?: ForeignJsxReach;
};

const buildContexts = new WeakMap<Readonly<Record<string, string>>, ClientGraphBoundaryBuildContext>();

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
	isEntrypoint = options.entrypointFile === path.resolve(options.absWorkingDir, args.path),
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
		source = fileSystem.readFileSync(args.path);
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
		preserveUnreachableSideEffectImports: !isEntrypoint,
	});
}

function resolveEntryImports(entrypointFiles: Set<string>, entrypoint: string): void {
	try {
		const source = fileSystem.readFileSync(entrypoint);
		const wrapper = /^\s*(?:export\s+\*\s+from|import)\s+(['"])([^'"\n]+)\1\s*;?\s*$/.exec(source);
		const specifier = wrapper?.[2];
		if (!specifier) return;
		if (path.isAbsolute(specifier)) {
			entrypointFiles.add(path.resolve(specifier));
		} else if (specifier.startsWith('.')) {
			entrypointFiles.add(path.resolve(path.dirname(entrypoint), specifier));
		}
	} catch {}
}

function getBuildContext(
	entrypoints: Readonly<Record<string, string>>,
	options: NormalizedClientGraphBoundaryOptions,
): ClientGraphBoundaryBuildContext {
	const existing = buildContexts.get(entrypoints);
	if (existing) return existing;

	const entrypointFiles = new Set<string>(
		Object.values(entrypoints).map((entry) => path.resolve(options.absWorkingDir, entry)),
	);
	for (const entrypoint of entrypointFiles) resolveEntryImports(entrypointFiles, entrypoint);
	const context: ClientGraphBoundaryBuildContext = {
		configs: [],
		entrypointFiles,
		requestedExports: buildRequestedExports.get(entrypoints) ?? new Map(),
	};
	buildRequestedExports.set(entrypoints, context.requestedExports);
	buildContexts.set(entrypoints, context);
	return context;
}

function getReactEntrypointFiles(context: ClientGraphBoundaryBuildContext): Set<string> {
	return new Set(
		context.configs
			.flatMap((config) => [config.entrypointFile, ...config.groupedEntrypointFiles])
			.filter((filePath): filePath is string => filePath !== undefined),
	);
}

function loadBuildClientGraphBoundaryModule(
	args: EcoBuildOnLoadArgs,
	context: ClientGraphBoundaryBuildContext,
): EcoBuildOnLoadResult | undefined {
	const sourcePath = path.resolve(context.configs[0]?.absWorkingDir ?? process.cwd(), args.path);
	const rootConfigs = context.configs.filter((config) => config.entrypointFile === sourcePath);
	const reactEntrypointFiles = getReactEntrypointFiles(context);
	if (context.entrypointFiles.has(sourcePath) && !reactEntrypointFiles.has(sourcePath)) {
		return undefined;
	}

	const first = context.configs[0];
	if (!first) return undefined;
	const groupedDeclaredModules = [...new Set(context.configs.flatMap((config) => config.groupedDeclaredModules))];
	const declaredModules = [...new Set(rootConfigs.flatMap((config) => config.declaredModules))];
	const options: NormalizedClientGraphBoundaryOptions = {
		...first,
		entrypointFile: rootConfigs.length > 0 ? sourcePath : undefined,
		groupedEntrypointFiles: reactEntrypointFiles,
		declaredModules,
		groupedDeclaredModules,
		alwaysAllowSpecifiers: [...new Set(context.configs.flatMap((config) => config.alwaysAllowSpecifiers))],
	};
	return loadClientGraphBoundaryModule(args, options, context.requestedExports);
}

function getForeignJsxReach(
	context: ClientGraphBoundaryBuildContext,
	projectRoot: string,
	isForeignFile: (filePath: string) => boolean,
): ForeignJsxReach {
	if (!context.foreignJsxReach) {
		const reactEntryFiles = new Set([...getReactEntrypointFiles(context)].map(toRealPath));
		context.foreignJsxReach = scanForeignJsxReach({
			projectRoot,
			reactEntryFiles,
			otherEntryFiles: [...context.entrypointFiles].map(toRealPath).filter((file) => !reactEntryFiles.has(file)),
			isForeignFile,
		});
	}
	return context.foreignJsxReach;
}

/**
 * Scope for React's foreign-JSX override: a file another JSX Integration owns gets React's JSX runtime only when
 * a React entry file reaches it.
 *
 * @remarks
 * Reach comes from a static import scan of the build's entry files before any module loads, so it does not
 * depend on load order. A foreign file only another Integration's entry reaches keeps its owner's runtime. One
 * that both reach fails the build, since it has one URL and so one compiled form. A build without boundary
 * plugins, and a file the scan does not find, keep the override, as in a React-only build.
 */
export function createForeignJsxScope(options: {
	projectRoot: string;
	hostIntegrationName: string;
	/** Name of the other JSX Integration that owns `filePath`; `undefined` when the file is not foreign. */
	findForeignOwner: (filePath: string) => string | undefined;
}): (build: EcoBuildPluginBuilder) => (sourcePath: string) => boolean {
	const isForeignFile = (filePath: string) => options.findForeignOwner(filePath) !== undefined;
	return (build) => (sourcePath) => {
		const context = build.entrypoints ? buildContexts.get(build.entrypoints) : undefined;
		const owner = options.findForeignOwner(sourcePath);
		if (!context || context.configs.length === 0 || owner === undefined) return true;
		const reach = getForeignJsxReach(context, options.projectRoot, isForeignFile);
		const filePath = toRealPath(sourcePath);
		const otherEntry = reach.others.get(filePath);
		if (otherEntry === undefined) return true;
		if (!reach.react.has(filePath)) return false;
		throw new Error(
			`[ecopages] ${filePath} is a ${owner} file that both ${options.hostIntegrationName} browser entries and ` +
				`another browser entry (${otherEntry}) import. ${options.hostIntegrationName} compiles it with its ` +
				`own JSX runtime and ${owner} with its runtime, but one module has one compiled form. Import it ` +
				`from one of them only.`,
		);
	};
}

/**
 * Instantiates the client graph boundary build plugin.
 *
 * @remarks
 * In a build shared with other Integrations it decides by file, never by the entry that reached a module: it
 * leaves an entry file no boundary instance declares to its own Integration and transforms every other source
 * module the same way, since a module has one URL and so one compiled form.
 */
export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	const normalizedOptions = normalizeClientGraphBoundaryOptions(options);
	const requestedExports = getRequestedExports(options?.groupedEntrypointFiles);

	return {
		name: 'ecopages-client-graph-boundary',
		cacheKey: normalizedOptions.cacheKey,
		setup(build) {
			if (
				!build.entrypoints ||
				(!normalizedOptions.entrypointFile && normalizedOptions.groupedEntrypointFiles.size === 0)
			) {
				const entrypointFiles = new Set(
					Object.values(build.entrypoints ?? {}).map((entrypoint) =>
						path.resolve(normalizedOptions.absWorkingDir, entrypoint),
					),
				);
				build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) =>
					loadClientGraphBoundaryModule(
						args,
						normalizedOptions,
						requestedExports,
						entrypointFiles.has(path.resolve(normalizedOptions.absWorkingDir, args.path)),
					),
				);
				return;
			}

			const context = getBuildContext(build.entrypoints, normalizedOptions);
			context.configs.push(normalizedOptions);
			build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) => loadBuildClientGraphBoundaryModule(args, context));
		},
	};
}
