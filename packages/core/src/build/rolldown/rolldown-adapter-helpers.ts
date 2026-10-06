/**
 * Shared helpers for the Rolldown-backed build adapters.
 *
 * @remarks
 * The standard {@link RolldownBuildAdapter} uses these helpers for
 * BuildOptions → Rolldown mapping and dependency-graph extraction. Node
 * runtime specifiers are resolved as externals during the build, so named
 * output hashes cover the bytes that are written.
 *
 * @module
 */

import { builtinModules, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordBuildEntryOutput, resolveBuildEntryPath } from '../build-graph.ts';
import type { InputOptions, OutputChunk, OutputOptions, RolldownOutput, RolldownPlugin } from 'rolldown';
import { isBarePackageImportSpecifier } from '../../plugins/tsconfig-import-resolver.ts';
import { createServerSideCssShimPlugin } from './server-side-css-shim-plugin.ts';
import { appLogger } from '../../global/app-logger.ts';
import { realpathOfDirectory } from '../preserve-import-meta-transform.ts';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';
import {
	getPackageNameFromSpecifier,
	isDeclaredAppPackageImport,
	isWorkspacePackageImport,
} from './app-package-declarations.ts';
import type {
	BuildDependencyGraph,
	BuildLog,
	BuildOptions,
	BuildOutput,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from '../build-adapter.ts';

const coreSourceFile = fileURLToPath(import.meta.url);
const nodeBuiltinSpecifiers = new Set(builtinModules);

let corePackageNames: Set<string> | undefined;

const CORE_RUNTIME_BUNDLED_PACKAGES = new Set<string>(['ws']);

/**
 * Returns the set of packages declared as direct dependencies in core's own
 * `package.json` (all dependency fields combined).
 *
 * @remarks
 * Result is cached for the lifetime of the process. This is safe because
 * core's own package.json does not change at runtime.
 */
function getCorePackageNames(): Set<string> {
	if (corePackageNames) {
		return corePackageNames;
	}

	const packageJsonPath = new URL('../../../package.json', import.meta.url);
	corePackageNames = new Set<string>();

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') {
				continue;
			}
			for (const name of Object.keys(entries as Record<string, unknown>)) {
				corePackageNames.add(name);
			}
		}
	} catch {
		// Return empty set on read/parse failure; packages will be bundled.
	}

	return corePackageNames;
}

export function transpileProfileToOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	switch (profile) {
		case 'browser-script':
		case 'hmr-runtime':
		case 'hmr-entrypoint':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
	}
}

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

const DEPLOY_LAYOUT_DOCS_URL = 'https://ecopages.app/docs/reference/deployment';
const MAX_WARNED_PACKAGE_NAMES = 5;

/**
 * Logs one line for a deployed server output file whose imports resolve
 * outside the app folder.
 *
 * @remarks
 * Such a package (in a workspace root `node_modules`, a global package store,
 * behind a symlinked root) is not copied with the app folder, so a moved
 * server build cannot load it. Only builds with
 * {@link BuildOptions.reportPackagesOutsideRoot} report it: the server entry
 * and the emitted config that `ecopages build` writes, one complete line per
 * output file. Module builds that the running server makes on the deploy
 * target stay silent. The line names the first
 * {@link MAX_WARNED_PACKAGE_NAMES} packages and counts the rest.
 */
function warnPackagesOutsideAppRoot(outputLabel: string, packageNames: Iterable<string>): void {
	const sorted = [...packageNames].sort();
	if (sorted.length === 0) return;
	const hidden = sorted.length - MAX_WARNED_PACKAGE_NAMES;
	const names = sorted.slice(0, MAX_WARNED_PACKAGE_NAMES).join(', ');
	const count = sorted.length === 1 ? '1 package' : `${sorted.length} packages`;
	appLogger.warn(
		`${outputLabel} imports ${count} from outside the app folder (${hidden > 0 ? `${names} and ${hidden} more` : names}); copy them with the app or build from a standalone install: ${DEPLOY_LAYOUT_DOCS_URL}`,
	);
}

function isUndeclaredPackageImport(id: string, contextRoot: string): boolean {
	return (
		!isNodeBuiltinSpecifier(id) &&
		!CORE_RUNTIME_BUNDLED_PACKAGES.has(getPackageNameFromSpecifier(id)) &&
		isPackageImport(id, contextRoot) &&
		!isDeclaredAppPackageImport(id, contextRoot)
	);
}

/**
 * @remarks
 * A store whose real path has no `node_modules` segment is not recognised, so
 * its packages are bundled. Yarn Plug'n'Play archives (`.zip` paths) are
 * bundled too: Node cannot import a path into an archive without the PnP
 * loader, so PnP installs are not supported for relocated server output.
 */
function isInstalledCompiledModule(filePath: string): boolean {
	return /\.[cm]?js$/u.test(filePath) && /[\\/]node_modules[\\/]/u.test(filePath) && !/\.zip[\\/]/u.test(filePath);
}

/**
 * Keeps installed compiled packages external as paths relative to the output
 * directory.
 *
 * @remarks
 * A compiled package can depend on its location on disk: it loads a native
 * binding (`sharp`, `oxc-parser`), a platform package, or a sibling file
 * through `createRequire(import.meta.url)` or `__dirname`. Bundled into
 * `dist/.server/`, that lookup starts from the wrong folder and fails at
 * runtime, and the bundle cannot tell which packages do it. So server builds
 * bundle source code only (the app, workspace packages, TypeScript or JSX
 * packages) and keep every compiled package installed in `node_modules`
 * external, including the dependencies of bundled workspace packages and of
 * Core itself.
 *
 * Under isolated installs (pnpm, Bun's isolated linker) a package the app does
 * not declare is not reachable as a bare specifier from `dist/.server`, so the
 * hook resolves it through Rolldown, from the importer (or, for Core's own
 * dependencies, from Core), so the `node` and `import` conditions apply and
 * the result is a real path, and returns a `./` or `../` path that Rolldown
 * writes unchanged. The output keeps working when `dist` and `node_modules`
 * move together, for example into a container image.
 *
 * The path is computed here rather than with `external: 'relative'`, because
 * Rolldown 1.2 computes that path from `cwd` instead of the output directory.
 * It is relative to `outdir`, so `generateBundle` rejects a chunk written in a
 * subdirectory that imports one of these paths. With `reportDir` (the
 * directory the output runs from) it also reports the packages that resolve
 * outside the app folder, naming the entry files by their path in that
 * directory.
 *
 * Packages the app declares stay bare specifiers through the `external`
 * option, which Rolldown checks before this hook. Packages in
 * `CORE_RUNTIME_BUNDLED_PACKAGES`, workspace and source packages, anything
 * that does not resolve and anything on another drive than `outdir` are
 * bundled.
 */
export function createInstalledPackageExternalPlugin(
	contextRoot: string,
	outdir: string,
	reportDir?: string,
): RolldownPlugin {
	const coreNames = getCorePackageNames();
	const externalIds = new Set<string>();
	const outsideRootPackages = new Set<string>();
	let realOutdir: string | undefined;
	let realContextRoot: string | undefined;
	return {
		name: 'ecopages-installed-package-external',
		resolveId: {
			filter: { id: /^[^./\\\0]/u },
			async handler(id, importer, extraOptions) {
				if (!isUndeclaredPackageImport(id, contextRoot)) {
					return null;
				}
				const packageName = getPackageNameFromSpecifier(id);
				const resolveOptions = { kind: extraOptions.kind, skipSelf: true };
				const resolved =
					(importer ? await this.resolve(id, importer, resolveOptions) : null) ??
					(coreNames.has(packageName) ? await this.resolve(id, coreSourceFile, resolveOptions) : null);
				if (!resolved || resolved.external || !isInstalledCompiledModule(resolved.id)) {
					return null;
				}
				realOutdir ??= realpathOfDirectory(outdir);
				const relativePath = path.relative(realOutdir, resolved.id).split(path.sep).join('/');
				if (path.isAbsolute(relativePath)) {
					return null;
				}
				realContextRoot ??= realpathOfDirectory(contextRoot);
				if (reportDir && path.relative(realContextRoot, resolved.id).startsWith('..')) {
					outsideRootPackages.add(packageName);
				}
				const externalId = relativePath.startsWith('../') ? relativePath : `./${relativePath}`;
				externalIds.add(externalId);
				return { id: externalId, external: true };
			},
		},
		generateBundle(_outputOptions, bundle) {
			const entryFileNames: string[] = [];
			for (const output of Object.values(bundle)) {
				if (output.type === 'chunk' && output.isEntry) entryFileNames.push(output.fileName);
				if (output.type !== 'chunk' || !output.fileName.includes('/')) continue;
				const nested = [...output.imports, ...output.dynamicImports].find((id) => externalIds.has(id));
				if (nested) {
					this.error(
						`[installed-package-external] "${output.fileName}" is written below the output directory but imports "${nested}", a path relative to the output directory. Use flat entry and chunk file names for builds with externalPackages.`,
					);
				}
			}
			if (reportDir) {
				const outputLabel = entryFileNames
					.map((fileName) =>
						path.relative(contextRoot, path.join(reportDir, fileName)).split(path.sep).join('/'),
					)
					.join(', ');
				warnPackagesOutsideAppRoot(outputLabel, outsideRootPackages);
			}
		},
	};
}

function isNodeBuiltinSpecifier(id: string): boolean {
	return id.startsWith('node:') || nodeBuiltinSpecifiers.has(id);
}

/**
 * Resolves Node builtins as external before Rolldown falls back to file resolution.
 *
 * @remarks
 * Rolldown documents two first-class externalization points: its `external`
 * option is checked before resolution, and a plugin `resolveId` hook can return
 * `{ id, external: true }`. Core uses the latter to keep Node-builtin ownership
 * explicit in the Node-target plugin pipeline.
 *
 * The hook runs before Rolldown's internal filesystem resolver, leaving imports
 * such as `node:fs` intact for the Node runtime. It is installed only for
 * Node-target builds, so browser bundles still surface accidental Node builtin
 * imports as resolver failures.
 *
 * See {@link https://rolldown.rs/in-depth/external-modules | Rolldown external modules}.
 */
export function createNodeBuiltinExternalPlugin(): RolldownPlugin {
	return {
		name: 'ecopages-node-builtin-external',
		resolveId(id) {
			return isNodeBuiltinSpecifier(id) ? { id, external: true } : null;
		},
	};
}

/**
 * Rejects Node builtins in browser-target builds before Rolldown externalizes them.
 *
 * @remarks
 * With `platform: 'browser'`, Rolldown leaves `node:*` imports in the output as
 * bare specifiers. This plugin fails the build instead so server-only graphs
 * cannot reach the browser as silent CORS errors.
 */
export function createBrowserNodeBuiltinGuardPlugin(): RolldownPlugin {
	return {
		name: 'ecopages-browser-node-builtin-guard',
		resolveId(id, importer) {
			if (!isNodeBuiltinSpecifier(id)) {
				return null;
			}

			const from = importer ? ` (imported from ${importer})` : '';
			throw new Error(
				`[browser-build] Node builtin "${id}" cannot be bundled for the browser${from}. ` +
					`Check package "browser" exports and the client-graph boundary for the importer.`,
			);
		},
	};
}

function mapRolldownFormat(value: string | undefined): 'esm' | 'cjs' | 'iife' | undefined {
	switch (value) {
		case 'cjs':
			return 'cjs';
		case 'iife':
			return 'iife';
		default:
			return 'esm';
	}
}

function mapRolldownPlatform(value: string | undefined): 'browser' | 'node' | 'neutral' {
	if (value === 'browser') return 'browser';
	if (value === 'node') return 'node';
	if (value && /^(?:es\d+|chrome\d+|edge\d+|firefox\d+|safari\d+|hermes|deno\d+|ios\d+)$/.test(value)) {
		return 'node';
	}
	return 'neutral';
}

function mapRolldownSourcemap(value: string | undefined): boolean | 'inline' | 'hidden' {
	switch (value) {
		case 'none':
			return false;
		case 'inline':
			return 'inline';
		case 'external':
		case 'linked':
			return 'hidden';
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
	if (options.target === 'browser') {
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

export function toBuildLogs(error: unknown): BuildLog[] {
	if (error instanceof Error) {
		return [{ message: error.message }];
	}
	return [{ message: 'Unknown build error' }];
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
	rolldownPlatform: ReturnType<typeof mapRolldownPlatform>,
): Promise<RolldownPlugin[]> {
	const bundlePlugins = options.plugins ?? [];
	const sourceTransforms = options.sourceTransforms ?? [];
	const appPlugins = await createRolldownPluginBridge(bundlePlugins, contextRoot, sourceTransforms);
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
		...(rolldownPlatform === 'node' ? [createNodeBuiltinExternalPlugin()] : []),
		...(rolldownPlatform === 'browser' ? [createBrowserNodeBuiltinGuardPlugin()] : []),
		...(options.target !== 'browser' ? [createServerSideCssShimPlugin()] : []),
		...appPlugins,
	];
}

async function buildRolldownInputOptions(
	options: BuildOptions,
	contextRoot: string,
	outdir: string,
	external: (id: string) => boolean,
	rolldownPlatform: ReturnType<typeof mapRolldownPlatform>,
): Promise<InputOptions> {
	return {
		input: options.entrypoints,
		cwd: contextRoot,
		external,
		platform: rolldownPlatform,
		transform: buildRolldownTransformOptions(options),
		resolve: options.conditions ? { conditionNames: options.conditions } : undefined,
		treeshake: typeof options.treeshaking === 'boolean' ? options.treeshaking : true,
		...(process.env.ECOPAGES_PROFILE_BUILD === '1'
			? {}
			: {
					checks: {
						pluginTimings: false,
					},
				}),
		experimental: {
			nativeMagicString: true,
		},
		plugins: await buildRolldownInputPlugins(options, contextRoot, outdir, rolldownPlatform),
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
): Promise<ResolvedRolldownOptions> {
	const rolldownPlatform = mapRolldownPlatform(options.target);
	const external = createExternalMatcher(options, appRootRequireCache);
	return {
		inputOptions: await buildRolldownInputOptions(options, contextRoot, outdir, external, rolldownPlatform),
		outputOptions: buildRolldownOutputOptions(options, outdir),
	};
}

/** Maps a Rolldown `output` to a normalized {@link BuildResult}. */
export function buildResultFromRolldownOutput(
	output: RolldownOutput,
	outdir: string,
	contextRoot: string,
	dependencyGraph: BuildDependencyGraph,
	entrypoints: BuildOptions['entrypoints'],
): BuildResult {
	const outputs: BuildOutput[] = output.output.map((entry) => ({
		path: normalizeOutputPath(entry.fileName, outdir),
	}));

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
		logs: [],
		outputs,
		dependencyGraph,
		outputGraph,
		entryOutputs,
	};
}
