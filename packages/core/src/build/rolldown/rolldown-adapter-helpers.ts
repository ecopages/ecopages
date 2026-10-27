/**
 * Shared helpers for the Rolldown-backed build adapters.
 *
 * @remarks
 * The standard {@link RolldownBuildAdapter} uses these helpers for
 * BuildOptions → Rolldown mapping and dependency-graph extraction. Rolldown's
 * node platform keeps Node builtins external, so named output hashes cover
 * the bytes that are written.
 *
 * @module
 */

import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { recordBuildEntryOutput, resolveBuildEntryPath } from '../build-graph.ts';
import type {
	BundleError,
	InputOptions,
	OutputChunk,
	OutputOptions,
	RolldownLog,
	RolldownOutput,
	RolldownPlugin,
} from 'rolldown';
import { id as idFilter, include } from 'rolldown/filter';
import { escapeRegExp } from '../../utils/regex-escaping.ts';
import { isEcopagesEnvEnabled } from '../../env.ts';
import { isBarePackageImportSpecifier } from '../../plugins/tsconfig-import-resolver.ts';
import { isServerOnlyModuleSpecifier } from '../contracts/server-only-specifier.ts';
import { createServerSideCssShimPlugin } from './server-side-css-shim-plugin.ts';
import type { BuildInputRecorder } from './rolldown-plugin-bridge.ts';
import { createRolldownPluginBridge, getEcoBuildPluginName } from './rolldown-plugin-bridge.ts';
import { isDeclaredAppPackageImport, isWorkspacePackageImport } from './app-package-declarations.ts';
import { createInstalledPackageExternalPlugin } from './installed-package-external-plugin.ts';
import type {
	BuildDependencyGraph,
	BuildFormat,
	BuildOptions,
	BuildOutput,
	BuildLog,
	BuildSuccess,
	BuildSourcemap,
} from '../build-adapter.ts';

const nodeBuiltinSpecifiers = new Set(builtinModules);

function isPackageImport(id: string, contextRoot: string): boolean {
	return isBarePackageImportSpecifier(id, contextRoot);
}

function tryResolveModule(id: string, resolver: NodeJS.Require): string | undefined {
	try {
		return resolver.resolve(id);
	} catch {
		return undefined;
	}
}

function getAppRootRequire(cache: Map<string, NodeJS.Require>, contextRoot: string): NodeJS.Require {
	const cacheKey = path.resolve(contextRoot);
	let req = cache.get(cacheKey);
	if (!req) {
		req = createRequire(path.join(cacheKey, 'package.json'));
		cache.set(cacheKey, req);
	}
	return req;
}

/**
 * Determines whether a package import stays an external bare specifier.
 *
 * @remarks
 * Only packages the app declares and ships compiled qualify: the app's own
 * `node_modules` resolves them at runtime, so Integration renderers and
 * server bundles share one instance (for example one React). Workspace
 * packages and source (TypeScript or JSX) packages are bundled. Undeclared
 * compiled packages are handled by {@link createInstalledPackageExternalPlugin},
 * because isolated installs (pnpm, Bun's isolated linker) do not expose them
 * as bare specifiers to output directories like `.eco/` or `dist/.server/`.
 */
function isAppPackageExternal(
	id: string,
	contextRoot: string,
	appRootRequireCache: Map<string, NodeJS.Require>,
): boolean {
	if (isWorkspacePackageImport(id, contextRoot) || !isDeclaredAppPackageImport(id, contextRoot)) {
		return false;
	}

	const appResolvedPath = tryResolveModule(id, getAppRootRequire(appRootRequireCache, contextRoot));
	return !appResolvedPath || !/\.(?:[cm]?ts|tsx|jsx)$/u.test(appResolvedPath);
}

function createExternalMatcher(
	options: BuildOptions,
	appRootRequireCache: Map<string, NodeJS.Require>,
): (id: string) => boolean {
	const explicitExternals = new Set(options.external ?? []);
	const externalPackages = options.externalPackages === true;
	const contextRoot = options.root ? path.resolve(options.root) : process.cwd();

	return (id: string): boolean => {
		if (explicitExternals.has(id)) {
			return true;
		}
		if (!externalPackages || !isPackageImport(id, contextRoot)) {
			return false;
		}
		return isAppPackageExternal(id, contextRoot, appRootRequireCache);
	};
}

function isNodeBuiltinSpecifier(id: string): boolean {
	return id.startsWith('node:') || nodeBuiltinSpecifiers.has(id);
}

const nodeBuiltinFilter = new RegExp(
	`^(?:node:.*|${[...nodeBuiltinSpecifiers].map((specifier) => escapeRegExp(specifier)).join('|')})$`,
);

/**
 * Rejects Node builtins and `.server` modules in browser-target builds.
 *
 * @remarks
 * With `platform: 'browser'`, Rolldown leaves `node:*` imports in the output as
 * bare specifiers. This plugin fails the build instead so server-only graphs
 * cannot reach the browser as silent CORS errors.
 *
 * The `.server` check reads the resolved ids a module imports once it is parsed,
 * not the specifiers as written, so an alias such as a `package.json` `imports`
 * entry or a tsconfig path is rejected like a relative import. Rolldown has no
 * importer at `load`, so `moduleParsed` is the earliest hook that can name it.
 */
export function createBrowserServerOnlyGuardPlugin(): RolldownPlugin {
	const rejectServerOnly = (id: string, importer: string | undefined): never => {
		const from = importer ? ` (imported from ${importer})` : '';
		throw new Error(
			`[browser-build] server-only module "${id}" cannot be bundled for the browser${from}. Check the browser graph boundary for the importer.`,
		);
	};
	return {
		name: 'ecopages-browser-server-only-guard',
		resolveId: {
			filter: [include(idFilter(nodeBuiltinFilter))],
			handler(id, importer) {
				if (!isNodeBuiltinSpecifier(id)) {
					return null;
				}
				const from = importer ? ` (imported from ${importer})` : '';
				throw new Error(
					`[browser-build] Node builtin "${id}" cannot be bundled for the browser${from}. Check package "browser" exports and the client-graph boundary for the importer.`,
				);
			},
		},
		moduleParsed(info) {
			if (info.isEntry && isServerOnlyModuleSpecifier(info.id)) {
				rejectServerOnly(info.id, undefined);
			}
			for (const imported of [...info.importedIds, ...info.dynamicallyImportedIds]) {
				if (isServerOnlyModuleSpecifier(imported)) {
					rejectServerOnly(imported, info.id);
				}
			}
		},
	};
}

function mapRolldownFormat(value: BuildFormat | undefined): 'esm' | 'cjs' | 'iife' | undefined {
	switch (value) {
		case 'cjs':
			return 'cjs';
		case 'iife':
			return 'iife';
		default:
			return 'esm';
	}
}

function mapRolldownSourcemap(value: BuildSourcemap | undefined): boolean | 'inline' | 'hidden' {
	switch (value) {
		case 'none':
			return false;
		case 'inline':
			return 'inline';
		case 'external':
		case 'hidden':
			return 'hidden';
		case 'linked':
			return true;
		default:
			return true;
	}
}

function mapRolldownJsx(jsx: NonNullable<BuildOptions['jsx']>): Record<string, unknown> {
	const { factory, fragment, ...rest } = jsx;
	const out: Record<string, unknown> = { ...rest };
	if (factory !== undefined) {
		out.pragma = factory;
	}
	if (fragment !== undefined) {
		out.pragmaFrag = fragment;
	}
	return out;
}

function toEntryFileNamesPattern(value: string | undefined): { pattern: string; literal: boolean } | undefined {
	if (!value) {
		return undefined;
	}
	const literal = !/\[[^\]]+\]/u.test(value);
	const stripped = value.replaceAll(/\.?\[ext\]/g, '');
	if (stripped.length === 0) {
		return undefined;
	}
	return { pattern: stripped, literal };
}

function getJavaScriptOutExtension(options: BuildOptions, literal: boolean): string | undefined {
	if (literal) {
		return undefined;
	}
	if (options.environment === 'browser') {
		return '.js';
	}
	if (options.format === 'cjs') {
		return '.cjs';
	}
	return '.mjs';
}

function normalizeOutputPath(outputPath: string, outdir: string): string {
	return path.isAbsolute(outputPath) ? path.normalize(outputPath) : path.normalize(path.join(outdir, outputPath));
}

const BUILD_LOG_KEYS = ['code', 'hook', 'id', 'loc', 'plugin'] as const satisfies ReadonlyArray<keyof BuildLog>;

/**
 * Copies the {@link BuildLog} fields of a Rolldown error or warning into a plain log.
 *
 * @remarks
 * Other own fields, such as a PostCSS error's `source` or `postcssNode` or Rolldown's `binding` and `ids`, are left out. `message` and
 * `stack` are read explicitly because they are not enumerable on `Error` instances. Terminal colour codes
 * are stripped from `message` and `frame` so the log can be shown outside a terminal.
 */
export function toBuildLog(entry: unknown): BuildLog {
	if (!entry || typeof entry !== 'object' || typeof (entry as RolldownLog).message !== 'string') {
		return { message: 'Unknown build error' };
	}
	const source = entry as RolldownLog;
	const log: BuildLog = { message: stripVTControlCharacters(source.message) };
	for (const key of BUILD_LOG_KEYS) {
		if (source[key] !== undefined) {
			Object.assign(log, { [key]: source[key] });
		}
	}
	if (typeof source.frame === 'string') {
		log.frame = stripVTControlCharacters(source.frame);
	}
	if (typeof source.stack === 'string') {
		log.stack = source.stack;
	}
	const ecoBuildPluginName = getEcoBuildPluginName(entry);
	if (ecoBuildPluginName) {
		log.plugin = ecoBuildPluginName;
	}
	return log;
}

/**
 * Converts a build failure into logs, one per underlying error of a Rolldown `BundleError`.
 *
 * @remarks
 * Only an unattributed `BundleError` is expanded. An `AggregateError` or an error an `EcoBuildPlugin`
 * threw is one failure and becomes one log.
 */
export function toBuildLogs(error: unknown): BuildLog[] {
	const errors =
		error instanceof Error && !(error instanceof AggregateError) && !getEcoBuildPluginName(error)
			? (error as BundleError).errors
			: undefined;
	return (Array.isArray(errors) && errors.length > 0 ? errors : [error]).map(toBuildLog);
}

/** Translated Rolldown options for one {@link BuildOptions} request. */
export interface ResolvedRolldownOptions {
	inputOptions: InputOptions;
	outputOptions: OutputOptions;
}

function buildRolldownTransformOptions(options: BuildOptions): Record<string, unknown> | undefined {
	const transformOptions: Record<string, unknown> = {};
	if (options.define) {
		transformOptions.define = options.define;
	}
	if (options.jsx) {
		transformOptions.jsx = mapRolldownJsx(options.jsx);
	}
	if (options.target && /^(?:es|chrome|edge|firefox|safari|hermes|deno|ios)/.test(options.target)) {
		transformOptions.target = options.target;
	}
	return Object.keys(transformOptions).length > 0 ? transformOptions : undefined;
}

async function buildRolldownInputPlugins(
	options: BuildOptions,
	contextRoot: string,
	outdir: string,
	rolldownPlatform: 'browser' | 'node',
	recordBuildInput: BuildInputRecorder,
): Promise<RolldownPlugin[]> {
	const entrypoints = Array.isArray(options.entrypoints)
		? Object.fromEntries(options.entrypoints.map((entry, index) => [String(index), entry]))
		: options.entrypoints;
	const appPlugins = await createRolldownPluginBridge(
		(options.plugins ?? []).filter((plugin) => plugin.environments?.includes(options.environment) ?? true),
		contextRoot,
		recordBuildInput,
		entrypoints,
	);
	return [
		...(options.externalPackages === true
			? [
					createInstalledPackageExternalPlugin(
						contextRoot,
						outdir,
						options.reportPackagesOutsideRoot === true ? (options.runtimeOutdir ?? outdir) : undefined,
					),
				]
			: []),
		...(rolldownPlatform === 'browser' ? [createBrowserServerOnlyGuardPlugin()] : []),
		...(options.environment === 'server' ? [createServerSideCssShimPlugin()] : []),
		...appPlugins,
	];
}

async function buildRolldownInputOptions(
	options: BuildOptions,
	contextRoot: string,
	outdir: string,
	external: (id: string) => boolean,
	rolldownPlatform: 'browser' | 'node',
	recordBuildInput: BuildInputRecorder,
): Promise<InputOptions> {
	return {
		input: options.entrypoints,
		cwd: contextRoot,
		external,
		platform: rolldownPlatform,
		transform: buildRolldownTransformOptions(options),
		resolve: options.conditions ? { conditionNames: options.conditions } : undefined,
		treeshake: typeof options.treeshaking === 'boolean' ? options.treeshaking : true,
		...(isEcopagesEnvEnabled('ECOPAGES_PROFILE_BUILD')
			? {}
			: {
					checks: {
						pluginTimings: false,
					},
				}),
		experimental: {
			nativeMagicString: true,
		},
		plugins: await buildRolldownInputPlugins(options, contextRoot, outdir, rolldownPlatform, recordBuildInput),
	};
}

function resolveRolldownEntryFileNames(options: BuildOptions): string {
	const entryFileNames = toEntryFileNamesPattern(options.naming);
	const jsExtension = getJavaScriptOutExtension(options, entryFileNames?.literal ?? false);
	if (entryFileNames) {
		return jsExtension ? `${entryFileNames.pattern}${jsExtension}` : entryFileNames.pattern;
	}
	return jsExtension ? `[name]${jsExtension}` : '[name]';
}

function shouldDisableRolldownCodeSplitting(options: BuildOptions): boolean {
	if (options.splitting !== false) {
		return false;
	}
	const entrypointCount = Array.isArray(options.entrypoints)
		? options.entrypoints.length
		: Object.keys(options.entrypoints).length;
	return entrypointCount === 1;
}

function buildRolldownOutputOptions(options: BuildOptions, outdir: string): OutputOptions {
	return {
		dir: outdir,
		format: mapRolldownFormat(options.format),
		minify: !!options.minify,
		entryFileNames: resolveRolldownEntryFileNames(options),
		chunkFileNames: '[name]-[hash].js',
		assetFileNames: '[name]-[hash][extname]',
		...(options.preserveModules
			? {
					preserveModules: true,
					...(options.preserveModulesRoot ? { preserveModulesRoot: options.preserveModulesRoot } : {}),
				}
			: {}),
		sourcemap: mapRolldownSourcemap(options.sourcemap),
		...(shouldDisableRolldownCodeSplitting(options) ? { codeSplitting: false } : {}),
	};
}

/**
 * Translates a {@link BuildOptions} into Rolldown's `InputOptions` and
 * `OutputOptions`. Always sets `experimental.nativeMagicString: true`
 * and always consolidates eco plugins via the bridge, which runs every
 * plugin `setup`.
 */
export async function resolveRolldownOptions(
	options: BuildOptions,
	contextRoot: string,
	outdir: string,
	appRootRequireCache: Map<string, NodeJS.Require>,
	recordBuildInput: BuildInputRecorder,
): Promise<ResolvedRolldownOptions> {
	const rolldownPlatform = options.environment === 'browser' ? 'browser' : 'node';
	const external = createExternalMatcher(options, appRootRequireCache);
	return {
		inputOptions: await buildRolldownInputOptions(
			options,
			contextRoot,
			outdir,
			external,
			rolldownPlatform,
			recordBuildInput,
		),
		outputOptions: buildRolldownOutputOptions(options, outdir),
	};
}

/**
 * Whether Rolldown put a content hash in the name of this output.
 *
 * @remarks
 * Chunks that are not entries use `chunkFileNames` (`[name]-[hash].js`), and entries only hash when the request's
 * naming template has `[hash]`. A named asset follows `assetFileNames` (`[name]-[hash][extname]`), so it counts
 * when its file name is its own name plus a hash; an asset emitted with a fixed `fileName` does not. Source maps
 * are decided with their chunk by {@link isHashedSourceMap}.
 */
function isContentHashedOutput(entry: RolldownOutput['output'][number], entryNamingHashed: boolean): boolean {
	if (entry.type === 'chunk') return entry.isEntry ? entryNamingHashed : true;

	const fileName = path.posix.basename(entry.fileName);
	return entry.names.some((name) => {
		const extension = path.posix.extname(name);
		const stem = path.posix.basename(name, extension);
		return (
			fileName.startsWith(`${stem}-`) &&
			fileName.endsWith(extension) &&
			/^[A-Za-z0-9_-]+$/u.test(fileName.slice(stem.length + 1, fileName.length - extension.length))
		);
	});
}

/** A `.map` file is as content-hashed as the output it describes. */
function isHashedSourceMap(fileName: string, hashedFileNames: ReadonlySet<string>): boolean {
	return fileName.endsWith('.map') && hashedFileNames.has(fileName.slice(0, -'.map'.length));
}

/** Maps a Rolldown `output` to the output fields of a {@link BuildSuccess}. */
export function buildResultFromRolldownOutput(
	output: RolldownOutput,
	outdir: string,
	contextRoot: string,
	dependencyGraph: BuildDependencyGraph,
	entrypoints: BuildOptions['entrypoints'],
	naming?: BuildOptions['naming'],
	includeContent = false,
): Pick<BuildSuccess, 'success' | 'outputs' | 'dependencyGraph' | 'outputGraph' | 'entryOutputs'> {
	const entryNamingHashed = Boolean(naming?.includes('[hash]'));
	const hashedFileNames = new Set(
		output.output.filter((entry) => isContentHashedOutput(entry, entryNamingHashed)).map((entry) => entry.fileName),
	);
	const outputs: BuildOutput[] = output.output.map((entry) => {
		const contentHashed = hashedFileNames.has(entry.fileName) || isHashedSourceMap(entry.fileName, hashedFileNames);
		const normalized: BuildOutput = {
			path: normalizeOutputPath(entry.fileName, outdir),
			contentHashed,
		};
		if (includeContent) normalized.content = entry.type === 'chunk' ? entry.code : entry.source;
		return normalized;
	});

	const chunks = output.output.filter((entry): entry is OutputChunk => entry.type === 'chunk');

	const chunkNames = new Set(chunks.map((chunk) => chunk.fileName));
	const outputImport = (id: string) => (chunkNames.has(id) ? normalizeOutputPath(id, outdir) : id);
	const outputGraph = Object.fromEntries(
		chunks.map((chunk) => [
			normalizeOutputPath(chunk.fileName, outdir),
			{
				fileName: normalizeOutputPath(chunk.fileName, outdir),
				imports: chunk.imports.map(outputImport),
				dynamicImports: chunk.dynamicImports.map(outputImport),
				isEntry: chunk.isEntry,
				facadeModuleId: chunk.facadeModuleId ? resolveBuildEntryPath(chunk.facadeModuleId, contextRoot) : null,
				modules: Object.keys(chunk.modules),
			},
		]),
	);

	const entryOutputs: Record<string, string> = {};
	for (const chunk of chunks) {
		if (!chunk.isEntry || !chunk.facadeModuleId) {
			continue;
		}
		recordBuildEntryOutput(entryOutputs, normalizeOutputPath(chunk.fileName, outdir), {
			facadeModuleId: resolveBuildEntryPath(chunk.facadeModuleId, contextRoot),
			chunkName: chunk.name,
			entrypoints,
			root: contextRoot,
		});
	}

	return {
		success: true,
		outputs,
		dependencyGraph,
		outputGraph,
		entryOutputs,
	};
}
