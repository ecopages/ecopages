/**
 * @module ClientGraphBoundaryPlugin
 *
 * Build plugin securing the Ecopages isomorphic compilation pipeline.
 */

import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import type {
	EcoBuildFilter,
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from '@ecopages/core/integration';
import { parseModuleSource, resolveProjectModulePath } from '@ecopages/core/build';
import { parseDeclaredModules, toModuleBaseSpecifier } from './specifier-classification.ts';
import { classifyClientGraphModule } from './module-classification.ts';
import { transformClientGraphModule } from './boundary-plugin-transform.ts';
import { inlineReadFileSyncCalls } from './boundary-plugin-read-file-inline.ts';
import { scanForeignJsxReach, toRealPath, type ForeignJsxReach } from './foreign-jsx-reach.ts';
import { isReactBoundaryVariant, rewriteForeignImports } from './foreign-boundary-rewrite.ts';
import {
	createRequestedExportsPlan,
	type PlannedModule,
	type RequestedExportsPlan,
	type ResolvedImport,
} from './requested-exports-plan.ts';

/** Source modules the boundary may transform; virtual ids and installed packages never reach it. */
const SOURCE_FILES: EcoBuildFilter = {
	filter: /\.(tsx?|jsx?)(?:\?eco-variant=[\w-]+)?$/,
	exclude: /^\0|\/node_modules\//,
};

/**
 * The requested-export plan of one build and the modules read before it existed.
 *
 * @remarks
 * The plan is made on the first load of a module that is not an entry, so a build that loads only its
 * entries never scans the graph. An entry read before then is kept here for the scan to reuse.
 */
type PlanState = {
	seeds: Set<string>;
	plan?: Promise<RequestedExportsPlan>;
	loadedEntries: Map<string, PlannedModule | undefined>;
};

type ClientGraphBoundaryBuildContext = PlanState & {
	configs: NormalizedClientGraphBoundaryOptions[];
	entrypointFiles: Set<string>;
	foreignJsxReach?: ForeignJsxReach;
	entryReach?: AnyFileReach;
};

type AnyFileReach = {
	reactEntryFiles: ReadonlySet<string>;
	otherEntryFiles: ReadonlySet<string>;
	react: ReadonlySet<string>;
	others: ReadonlySet<string>;
};

const buildContexts = new WeakMap<Readonly<Record<string, string>>, ClientGraphBoundaryBuildContext>();

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

/**
 * @remarks
 * Every path is named relative to the project root, as no plugin key may hold an absolute path: the key joins
 * the dependency key of each React entry, which a moved build must still find in its ledger.
 */
function createBoundaryCacheKey(options: Omit<NormalizedClientGraphBoundaryOptions, 'cacheKey'>): string {
	const keyRoot = options.projectRoot ?? options.absWorkingDir;
	const toKeyPath = (filePath: string) => path.relative(keyRoot, filePath);
	return JSON.stringify({
		workingDir: toKeyPath(options.absWorkingDir),
		entrypointFile: options.entrypointFile ? toKeyPath(options.entrypointFile) : undefined,
		groupedEntrypointFiles: [...options.groupedEntrypointFiles].map(toKeyPath).sort(),
		groupedDeclaredModules: [...options.groupedDeclaredModules].sort(),
		declaredModules: [...options.declaredModules].sort(),
		alwaysAllowSpecifiers: [...options.alwaysAllowSpecifiers].sort(),
	});
}

function normalizeClientGraphBoundaryOptions(
	options?: ClientGraphBoundaryOptions,
): NormalizedClientGraphBoundaryOptions {
	const absWorkingDir = path.resolve(options?.absWorkingDir ?? path.cwd());
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
	const normalized = {
		absWorkingDir,
		projectRoot,
		entrypointFile,
		groupedEntrypointFiles,
		groupedDeclaredModules,
		declaredModules,
		alwaysAllowSpecifiers,
	};
	return { ...normalized, cacheKey: createBoundaryCacheKey(normalized) };
}

function readBoundaryModule(filePath: string, absWorkingDir: string): PlannedModule | undefined {
	let source: string;
	try {
		source = fileSystem.readFileSync(filePath);
	} catch {
		return undefined;
	}
	const inlining = inlineReadFileSyncCalls(source, filePath, absWorkingDir);
	let program: PlannedModule['program'];
	try {
		program = parseModuleSource(filePath, inlining.transformed).program;
	} catch {
		program = undefined;
	}
	return { source: inlining.transformed, program, inlined: inlining.modified, inlinedFiles: inlining.inlinedFiles };
}

/**
 * Resolves an import for the requested-export scan through the build's own resolver.
 *
 * @remarks
 * A module outside `node_modules` that the build bundles is followed, so a workspace package imported by
 * name counts like a relative import. Without a build resolver (a plugin driven outside Rolldown, as in
 * unit tests) relative and tsconfig path imports still resolve from the project. A resolve that throws is
 * an import the build itself rejects, such as a Node builtin in a browser build, so it is not followed.
 */
async function resolveScanImport(
	build: EcoBuildPluginBuilder,
	specifier: string,
	importer: string,
	projectRoot: string,
): Promise<ResolvedImport> {
	let resolved: Awaited<ReturnType<EcoBuildPluginBuilder['resolve']>>;
	try {
		resolved = await build.resolve(specifier, importer);
	} catch {
		return { kind: 'skip' };
	}
	const local = path.isAbsolute(specifier)
		? fileSystem.exists(specifier)
			? specifier
			: undefined
		: resolveProjectModulePath(projectRoot, importer, specifier, { preserveBarrel: true });
	const id = resolved ? (resolved.external ? undefined : resolved.id) : local;
	if (!resolved && !local) return { kind: 'unresolved' };
	if (!id || id.startsWith('\0') || id.split('/').includes('node_modules')) return { kind: 'skip' };
	return { kind: 'module', filePath: toRealPath(id.replace(/[?#].*$/, '')) };
}

/** The load of a module's source file: a module variant reads the same file as the plain module. */
function stripVariant(args: EcoBuildOnLoadArgs): EcoBuildOnLoadArgs {
	return { path: args.path.replace(/\?eco-variant=[\w-]+$/, '') };
}

function isTransformedSource(filePath: string, projectRoot: string | undefined): boolean {
	const category = classifyClientGraphModule(filePath, projectRoot);
	return SOURCE_FILES.filter.test(filePath) && (category === 'app' || category === 'workspace');
}

/**
 * Reads one module for its load: from the plan when the scan reached it, otherwise from disk.
 *
 * @remarks
 * The first module to load that is not an entry makes the plan, with that load's resolver; every other
 * load waits for the same plan.
 */
async function takeModule(
	build: EcoBuildPluginBuilder,
	state: PlanState,
	sourcePath: string,
	options: NormalizedClientGraphBoundaryOptions,
	transforms: () => (filePath: string) => boolean,
): Promise<{ module: PlannedModule | undefined; plan: RequestedExportsPlan | undefined }> {
	const realPath = toRealPath(sourcePath);
	if (!state.plan && !state.seeds.has(realPath)) {
		const projectRoot = options.projectRoot ?? options.absWorkingDir;
		state.plan = createRequestedExportsPlan({
			seeds: state.seeds,
			resolveImport: (specifier, importer) => resolveScanImport(build, specifier, importer, projectRoot),
			readModule: (filePath) =>
				state.loadedEntries.has(filePath)
					? state.loadedEntries.get(filePath)
					: readBoundaryModule(filePath, options.absWorkingDir),
			transforms: transforms(),
		});
		void state.plan.then(() => state.loadedEntries.clear());
	}
	const plan = await state.plan;
	const module = plan?.takeModule(realPath) ?? readBoundaryModule(sourcePath, options.absWorkingDir);
	if (!plan) state.loadedEntries.set(realPath, module);
	return { module, plan };
}

async function loadClientGraphBoundaryModule(
	build: EcoBuildPluginBuilder,
	args: EcoBuildOnLoadArgs,
	options: NormalizedClientGraphBoundaryOptions,
	state: PlanState,
	transforms: () => (filePath: string) => boolean,
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

	const { module, plan } = await takeModule(build, state, sourcePath, options, transforms);
	if (!module) return undefined;
	for (const inlinedFile of module.inlinedFiles) build.addWatchFile(inlinedFile);

	return transformClientGraphModule({
		filePath: args.path,
		module,
		category,
		globallyDeclaredSources,
		requestedExports: plan?.requestedExports(sourcePath),
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
		seeds: new Set(
			Object.values(entrypoints).map((entry) => toRealPath(path.resolve(options.absWorkingDir, entry))),
		),
		loadedEntries: new Map(),
	};
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
	build: EcoBuildPluginBuilder,
	args: EcoBuildOnLoadArgs,
	context: ClientGraphBoundaryBuildContext,
): Promise<EcoBuildOnLoadResult | undefined> | undefined {
	const sourcePath = path.resolve(context.configs[0]?.absWorkingDir ?? path.cwd(), args.path);
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
	return loadClientGraphBoundaryModule(build, args, options, context, () => isTransformedByBuild(context));
}

/** Whether the shared build transforms a file: a source file that is not another Integration's entry. */
function isTransformedByBuild(context: ClientGraphBoundaryBuildContext): (filePath: string) => boolean {
	const projectRoot = context.configs[0]?.projectRoot;
	const entrypointFiles = new Set([...context.entrypointFiles].map(toRealPath));
	const reactEntrypointFiles = new Set([...getReactEntrypointFiles(context)].map(toRealPath));
	return (filePath) =>
		isTransformedSource(filePath, projectRoot) &&
		(!entrypointFiles.has(filePath) || reactEntrypointFiles.has(filePath));
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
 * The file itself when it is a browser entry of the build that no React entry file claims.
 *
 * @remarks
 * The import scan records only files an entry imports, so a foreign file that is bundled as its own entry, such
 * as a Radiant script, is absent from it. Without this it would count as a file the scan did not find and keep
 * React's override.
 */
function findForeignEntry(context: ClientGraphBoundaryBuildContext, filePath: string): string | undefined {
	const entryFiles = new Set([...context.entrypointFiles].map(toRealPath));
	const reactEntryFiles = new Set([...getReactEntrypointFiles(context)].map(toRealPath));
	return entryFiles.has(filePath) && !reactEntryFiles.has(filePath) ? filePath : undefined;
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
		const otherEntry = reach.others.get(filePath) ?? findForeignEntry(context, filePath);
		if (otherEntry === undefined) return true;
		if (!reach.react.has(filePath)) return false;
		const importedBy =
			otherEntry === filePath
				? `is itself a browser entry and ${options.hostIntegrationName} browser entries import it`
				: `that both ${options.hostIntegrationName} browser entries and another browser entry (${otherEntry}) import`;
		throw new Error(
			`[ecopages] ${filePath} is a ${owner} file ${importedBy}. ${options.hostIntegrationName} compiles it with its ` +
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
 * module the same way, since a module has one URL and so one compiled form. The instances of one build share
 * their options through the build's `entrypoints`, and only the first registers a handler, so each module is
 * read and analysed once whatever the number of React entries.
 *
 * A boundary without entry options, or in a build without `entrypoints`, works alone and starts its plan
 * from the build's entries, or from its own entry files.
 */
export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	const normalizedOptions = normalizeClientGraphBoundaryOptions(options);

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
				const state: PlanState = {
					seeds: new Set(
						[...(build.entrypoints ? entrypointFiles : normalizedOptions.groupedEntrypointFiles)].map(
							toRealPath,
						),
					),
					loadedEntries: new Map(),
				};
				const transforms = () => (filePath: string) =>
					isTransformedSource(filePath, normalizedOptions.projectRoot);
				build.onLoad(SOURCE_FILES, (loaded) =>
					loadClientGraphBoundaryModule(
						build,
						stripVariant(loaded),
						normalizedOptions,
						state,
						transforms,
						entrypointFiles.has(path.resolve(normalizedOptions.absWorkingDir, stripVariant(loaded).path)),
					),
				);
				return;
			}

			const context = getBuildContext(build.entrypoints, normalizedOptions);
			context.configs.push(normalizedOptions);
			if (context.configs.length > 1) return;
			build.onLoad(SOURCE_FILES, (loaded) =>
				loadBuildClientGraphBoundaryModule(build, stripVariant(loaded), context),
			);
		},
	};
}

/** The files React entries reach and the files other entries reach, by a static scan of the build's entries. */
function getEntryReach(context: ClientGraphBoundaryBuildContext, projectRoot: string): AnyFileReach {
	if (!context.entryReach) {
		const reactEntryFiles = new Set([...getReactEntrypointFiles(context)].map(toRealPath));
		const otherEntryFiles = [...context.entrypointFiles]
			.map(toRealPath)
			.filter((file) => !reactEntryFiles.has(file));
		const reach = scanForeignJsxReach({
			projectRoot,
			reactEntryFiles,
			otherEntryFiles,
			isForeignFile: () => true,
		});
		context.entryReach = {
			reactEntryFiles,
			otherEntryFiles: new Set(otherEntryFiles),
			react: reach.react,
			others: new Set(reach.others.keys()),
		};
	}
	return context.entryReach;
}

/**
 * Instantiates the build plugin that gives React modules the boundary of every Eco Component another Integration
 * owns, in the production bundle and the development transform alike.
 *
 * @remarks
 * It rewrites the imports of foreign-owned Components in a module's source after it loads, so MDX, which
 * compiles to such imports, is covered too. A module that imports none is left untouched.
 *
 * A module has one compiled form per id, so a module that another entry also reaches and that imports a foreign
 * Component gets two: React's graph imports it under the id `<path>?eco-variant=react-boundary`, which this plugin
 * rewrites, and the other graph keeps the plain id, which it leaves alone. The variant's own imports follow the
 * same rule. In a build without entries to compare, `isSharedFile` says which modules another graph uses.
 */
export function createForeignBoundaryPlugin(options: {
	projectRoot: string;
	/** Whether `filePath` belongs to an Integration other than React. */
	isForeignFile: (filePath: string) => boolean;
	/** Whether another module graph uses `filePath`, in a build whose entries cannot say. */
	isSharedFile?: (filePath: string) => boolean;
}): EcoBuildPlugin {
	return {
		name: 'ecopages-react-foreign-boundary',
		environments: ['browser'],
		setup(build) {
			build.onLoad({ filter: /\?eco-variant=[\w-]+$/, exclude: /^\0|\/node_modules\// }, (loaded) => {
				const filePath = stripVariant(loaded).path;
				build.addWatchFile(filePath);
				return {
					contents: fileSystem.readFileSync(filePath),
					loader: path.extname(filePath).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx',
				};
			});
			build.transform({ filter: /\.(?:[cm]?[jt]sx?|mdx?)$/, exclude: /^\0|\/node_modules\// }, (code, id) => {
				const filePath = toRealPath(id.replace(/[?#].*$/, ''));
				if (options.isForeignFile(filePath)) return undefined;
				const context = build.entrypoints ? buildContexts.get(build.entrypoints) : undefined;
				const reach =
					context && context.configs.length > 0 ? getEntryReach(context, options.projectRoot) : undefined;
				const inReactGraph =
					!reach ||
					isReactBoundaryVariant(id) ||
					reach.reactEntryFiles.has(filePath) ||
					(reach.react.has(filePath) && !reach.others.has(filePath));
				if (!inReactGraph) return undefined;
				return rewriteForeignImports(code, filePath, {
					projectRoot: options.projectRoot,
					isForeignFile: options.isForeignFile,
					isSharedFile: reach
						? (file) => reach.others.has(file) && reach.react.has(file)
						: options.isSharedFile,
				});
			});
		},
	};
}
