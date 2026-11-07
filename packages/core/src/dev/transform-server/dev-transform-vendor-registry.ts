import { contentHash } from '../../utils/content-hash.ts';
import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../../constants.ts';
import { resolveAppBuildPlugins } from '../../build/runtime/build-request-policy.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import type { BuildFailure, BuildResult } from '../../build/contracts/build-contracts.ts';
import {
	clearBarePackageResolverCaches,
	resolveBarePackageBrowserEntry,
} from '../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../plugins/package-specifier.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { formatBuildLog } from '../../build/build-log.ts';
import { appLogger } from '../../global/app-logger.ts';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { escapeRegExp } from '../../utils/regex-escaping.ts';
import type { VendorImport } from './dev-transform-import-rewriter.ts';
import type { DevTransformVendorEntries } from '../../types/dev-transform-types.ts';

const BROWSER_FIRST_VENDOR_CONDITIONS = ['browser', 'module', 'import', 'default'] as const;
const MODULE_FIRST_VENDOR_CONDITIONS = ['module', 'import', 'default'] as const;
const BROWSER_NODE_BUILTIN_GUARD_MARKER = '[browser-build] Node builtin';
const VENDOR_GRAPH_QUIET_PERIOD_MS = 50;
const VENDOR_GRAPH_RETRY_BACKOFF_MS = 2_000;
const VENDOR_ENTRIES_FILE = 'dev-vendor-entries.json';

type VendorGraphKey = 'browser-first' | 'module-first';

/** A bare specifier and the directory an importer resolved it from. */
type VendorEntrySource = {
	specifier: string;
	resolveDir: string;
};

/** One known dependency entry: the package file it resolves to, and every specifier and directory that reached it. */
type VendorEntry = {
	/** The first specifier that reached the file; it names the URL. */
	specifier: string;
	entryPath: string;
	url: string;
	sources: VendorEntrySource[];
};

/** The result of one build of a vendor graph. */
type VendorGraphBuild = {
	/** The registry generation the build started in; a build of an older generation is only a fallback. */
	generation: number;
	entryPaths: ReadonlySet<string>;
	/** Output contents keyed by served URL: entries and shared chunks. */
	outputs: ReadonlyMap<string, string>;
	/** Entry paths whose module is CommonJS, so their output has only a default export. */
	commonJsEntryPaths: ReadonlySet<string>;
	/** The error served for each entry that has no output in this build. */
	errors: ReadonlyMap<string, Error>;
	/** Entries that failed alone while others built; they stay out of later builds of the generation. */
	failed: ReadonlyMap<string, Error>;
	/** URLs of this build that a browser has received. */
	servedUrls: Set<string>;
	/** When the graph failed as a whole; set only on a build that kept the last good outputs. */
	failedAt?: number;
};

type ScheduledVendorGraphBuild = {
	promise: Promise<VendorGraphBuild>;
	resolve: (build: VendorGraphBuild) => void;
	timer: ReturnType<typeof setTimeout>;
};

type RunningVendorGraphBuild = {
	generation: number;
	entryPaths: ReadonlySet<string>;
	promise: Promise<VendorGraphBuild>;
};

/**
 * Every known dependency entry that is built with one list of resolve conditions.
 *
 * @remarks
 * `@ecopages/core` resolves browser-first so its browser entry wins over its Node entry, while other packages
 * resolve module-first, as they always have. Rolldown takes one condition list per build, so each list gets its
 * own graph. Inside one graph a module has exactly one chunk. A module-first package's `@ecopages/core` imports
 * point at core's browser-first entries, so core loads once; any other package that both graphs reach loads once
 * per graph.
 */
type VendorGraph = {
	key: VendorGraphKey;
	conditions: readonly string[];
	entries: Map<string, VendorEntry>;
	/** Entries that failed alone in this generation; they stay out of later builds until {@link DevTransformVendorRegistry.invalidateAll}. */
	failed: Map<string, Error>;
	/** The last committed build; after {@link DevTransformVendorRegistry.invalidateAll} it only backs a failed rebuild. */
	current?: VendorGraphBuild;
	scheduled?: ScheduledVendorGraphBuild;
	running?: RunningVendorGraphBuild;
	/** Serializes the builds of the graph. */
	queue: Promise<void>;
};

type PersistedVendorEntries = {
	entries: { specifier: string; resolveDir: string; conditions: VendorGraphKey }[];
};

type VendorOutputLookup = { build: VendorGraphBuild; url: string; content: string } | { error: Error } | null;

/** Whether a package file has an `import` or `export` statement, which makes it an ES module rather than CommonJS. */
function hasModuleSyntax(filePath: string): boolean {
	try {
		return parseModuleSource(filePath, fileSystem.readFileSync(filePath)).module.hasModuleSyntax;
	} catch {
		return true;
	}
}

const BROWSER_FIRST_PACKAGE = '@ecopages/core';
const BROWSER_FIRST_SPECIFIER = new RegExp(`^${escapeRegExp(BROWSER_FIRST_PACKAGE)}(?:/|$)`, 'u');
const PIN_ENTRY_NAME = '__eco_vendor_pin';
const PIN_SPECIFIER = 'ecopages:vendor-pin';
const PIN_MODULE_ID = '\0ecopages-vendor-pin';

/**
 * Adds an entry to each vendor build that keeps the shape of the other entries the same from one build to the next.
 *
 * @remarks
 * A browser that loaded a vendor file keeps its module, so a later build of the graph must not change a file it
 * already served; when it does, the page reloads. Two things would change one as packages arrive. Rolldown puts the
 * helpers its CommonJS interop needs in one shared runtime chunk, keeps only the ones the build uses and names the
 * chunk after its content, so a package that needs one more helper renames it in every entry that imports it. And a
 * CommonJS entry exports its module's `require` function only once another entry imports it, so a package that
 * imports `react/jsx-runtime` adds an export to that entry. The pin re-exports every helper and the namespace of every
 * entry whose file has no `import` or `export` statement, so each runtime helper and each CommonJS `require` export is
 * there from the first build. It leaves ES module entries alone: importing one would move its code into a shared
 * chunk behind the entry. Nothing requests the pin's own output.
 */
function exactly(value: string): RegExp {
	return new RegExp(`^${escapeRegExp(value)}$`, 'u');
}

function createVendorPinPlugin(entries: readonly VendorEntry[]): EcoBuildPlugin {
	const contents = [
		'export * from "\\0rolldown/runtime.js";',
		...entries
			.filter((entry) => !hasModuleSyntax(entry.entryPath))
			.map((entry, index) => `export * as __eco_pin_${index} from ${JSON.stringify(entry.entryPath)};`),
	].join('\n');
	return {
		name: 'ecopages-dev-vendor-pin',
		cacheKey: contents,
		setup(build) {
			build.onResolve({ filter: exactly(PIN_SPECIFIER) }, () => ({ path: PIN_MODULE_ID }));
			build.onLoad({ filter: exactly(PIN_MODULE_ID) }, () => ({ contents, loader: 'js' }));
		},
	};
}

function getVendorGraphKey(specifier: string): VendorGraphKey {
	return toPackageRootSpecifier(specifier) === BROWSER_FIRST_PACKAGE ? 'browser-first' : 'module-first';
}

export type DevTransformVendorRegistryOptions = {
	appConfig: EcoPagesAppConfig;
	resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
	/**
	 * Called when a vendor graph was rebuilt after a browser received output of its previous build that the new
	 * build changes or drops.
	 *
	 * @remarks
	 * A page that keeps the old chunks and loads new ones could hold two copies of one module, so the caller
	 * reloads connected pages.
	 */
	onVendorGraphChange?: () => void;
};

/**
 * Prebundles bare npm imports into process-local `/assets/vendors/*` files, one code-split Rolldown build per
 * vendor graph.
 *
 * @remarks
 * Every known dependency entry is an entry of one build, so a file shared by two entries of a package, a package
 * shared by two packages, and a CommonJS module required by two packages each become one shared chunk with one
 * URL. Entry URLs are `<label>.<hash of the entry path>.js` and stay the same across rebuilds, so app modules
 * that embed them stay valid; chunks are content-hashed and imported relatively from the same directory.
 *
 * A new entry rebuilds its graph after a short quiet period, which collects the bare imports of one page load
 * into one build. The known entries are written to the app's `workDir` after each build and seed the next dev
 * process, which then builds the full graph on its first request. Bundle contents stay in memory.
 *
 * A build that fails as a whole, rather than for some of its entries, keeps the previous build's outputs, so a
 * transient failure such as one during a package install leaves working vendors serving.
 */
export class DevTransformVendorRegistry {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
	private readonly onVendorGraphChange?: () => void;
	private readonly graphs = new Map<VendorGraphKey, VendorGraph>();
	private readonly entriesByUrl = new Map<string, { graph: VendorGraph; entry: VendorEntry }>();
	private generation = 0;
	private readonly warnedPackageCopies = new Set<string>();
	private persistedContents?: string;

	constructor(options: DevTransformVendorRegistryOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.resolveVendorBundlePlugins = options.resolveVendorBundlePlugins;
		this.onVendorGraphChange = options.onVendorGraphChange;
		this.graphs.set('browser-first', createVendorGraph('browser-first', BROWSER_FIRST_VENDOR_CONDITIONS));
		this.graphs.set('module-first', createVendorGraph('module-first', MODULE_FIRST_VENDOR_CONDITIONS));
		this.seedPersistedEntries();
	}

	/**
	 * Returns the stable vendor URL of a bare specifier once a build of its graph that contains it finished.
	 *
	 * @param importer - The importing module's path; defaults to a module at the app root.
	 *
	 * @remarks
	 * Rejects with the prebundle error when the entry failed to build.
	 */
	async resolveVendorUrl(specifier: string, importer?: string): Promise<string> {
		const resolveDir = importer ? resolveImporterDir(importer) : this.rootResolveDir;
		return (await this.resolveVendorEntry(specifier, resolveDir)).url;
	}

	/**
	 * Returns the vendor URL of a bare specifier imported by `importer`, and whether that build found its module to
	 * be CommonJS.
	 *
	 * @remarks
	 * The specifier resolves from the importer's directory, as Node and the production bundle resolve it, so a
	 * dependency that only the importing package declares resolves under a strict install, and two importers that
	 * reach two installed versions of one package get two entries. Importers that resolve it to the same file share
	 * one entry and one URL.
	 *
	 * A CommonJS entry is served with `module.exports` as its default export and no named exports, so the import
	 * rewriter reads named imports of it from the default export.
	 */
	resolveVendorImport(specifier: string, importer: string): Promise<VendorImport> {
		return this.resolveVendorEntry(specifier, resolveImporterDir(importer));
	}

	private async resolveVendorEntry(specifier: string, resolveDir: string): Promise<VendorImport> {
		const entryPath = this.resolvePackageEntry(specifier, resolveDir);
		const { graph, entry } = this.addEntry(specifier, resolveDir, entryPath);
		const build = await this.waitForBuildContaining(graph, entry.entryPath);
		const error = build.errors.get(entry.entryPath);
		if (error) {
			throw error;
		}
		return { url: entry.url, commonJs: build.commonJsEntryPaths.has(entry.entryPath) };
	}

	/**
	 * @remarks
	 * A request for a known entry whose graph is still building, or was invalidated, waits for a build that
	 * contains it. A chunk is only requested by a file that a finished build served, and a rebuild that changes a
	 * served file reports a graph change, so a chunk request does not wait. Responses carry `no-cache` and a
	 * content `ETag`, so browsers revalidate each load and get `304` while `ifNoneMatch` still matches the
	 * in-memory output.
	 */
	async tryHandleVendorRequest(pathname: string, ifNoneMatch?: string | null): Promise<Response | null> {
		if (!pathname.startsWith(`/${RESOLVED_ASSETS_VENDORS_DIR}/`)) {
			return null;
		}

		const found = await this.findOutput(pathname);
		if (!found) {
			return null;
		}

		if ('error' in found) {
			return new Response(found.error.message, {
				status: 500,
				headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
			});
		}

		found.build.servedUrls.add(found.url);
		return createVendorResponse(found.url, found.content, ifNoneMatch);
	}

	/**
	 * Adds the entries of bare specifiers that modules are known to import, without building.
	 *
	 * @param resolveFrom - A directory inside the package that declares them, which they resolve from.
	 *
	 * @remarks
	 * Generated modules such as hydration bootstraps import their packages one request after another. Knowing
	 * them up front puts them all in the first build of their graph, so a later build does not move a module a
	 * browser already loaded into a new shared chunk and reload the page. A specifier that does not resolve is
	 * skipped.
	 */
	addKnownEntries({ resolveFrom, specifiers }: DevTransformVendorEntries): void {
		const resolveDir = resolveDirectory(resolveFrom);
		for (const specifier of specifiers) {
			const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier, resolveDir);
			if (resolved) this.addEntry(specifier, resolveDir, resolved.path);
		}
	}

	/**
	 * Rebuilds every graph on its next request and resolves each known specifier again, keeping the known
	 * entries.
	 *
	 * @remarks
	 * A build that started before this call still settles for its waiters but is not kept. The last build is kept
	 * only as the fallback of a rebuild that fails as a whole. Each specifier resolves again from every directory
	 * that reached its entry, so after a package upgrade each importer moves to the file it now reaches; an entry
	 * that no source resolves any more is kept as it was. A source whose directory no longer exists, such as a
	 * deleted workspace package, is dropped, and an entry left without sources goes with it.
	 */
	invalidateAll(): void {
		this.generation += 1;
		clearBarePackageResolverCaches();
		for (const graph of this.graphs.values()) {
			graph.failed.clear();
			const previous = [...graph.entries.values()];
			graph.entries.clear();
			for (const entry of previous) this.entriesByUrl.delete(entry.url);
			for (const entry of previous) {
				const sources = entry.sources.filter((source) => fileSystem.exists(source.resolveDir));
				if (sources.length === 0) continue;
				let reached = false;
				for (const source of sources) {
					const resolved = resolveBarePackageBrowserEntry(
						this.appConfig.rootDir,
						source.specifier,
						source.resolveDir,
					);
					if (!resolved) continue;
					this.addEntry(source.specifier, source.resolveDir, resolved.path);
					reached = true;
				}
				if (!reached && !graph.entries.has(entry.entryPath)) {
					entry.sources = sources;
					graph.entries.set(entry.entryPath, entry);
					this.entriesByUrl.set(entry.url, { graph, entry });
				}
			}
		}
	}

	/**
	 * @remarks
	 * Entries are keyed by the resolved file, so importers that reach one file share its entry and URL; the first
	 * specifier names the URL, and every specifier and directory pair is kept as a source of the entry.
	 */
	private addEntry(
		specifier: string,
		resolveDir: string,
		entryPath: string,
	): { graph: VendorGraph; entry: VendorEntry } {
		const graph = this.requireGraph(getVendorGraphKey(specifier));
		const existing = graph.entries.get(entryPath);
		if (existing) {
			if (
				!existing.sources.some((source) => source.specifier === specifier && source.resolveDir === resolveDir)
			) {
				existing.sources.push({ specifier, resolveDir });
			}
			return { graph, entry: existing };
		}

		const entry: VendorEntry = {
			specifier,
			entryPath,
			url: `/${RESOLVED_ASSETS_VENDORS_DIR}/${sanitizeSpecifierForFileName(specifier)}.${contentHash(entryPath, 8)}.js`,
			sources: [{ specifier, resolveDir }],
		};
		graph.entries.set(entryPath, entry);
		this.entriesByUrl.set(entry.url, { graph, entry });
		this.warnOnDuplicatePackageCopies(specifier);
		return { graph, entry };
	}

	/**
	 * Warns when the package of `specifier` is reached in more than one installed copy.
	 *
	 * @remarks
	 * Each copy is its own vendor entry and loads as its own module, as in the production build. That is right for
	 * two versions an app means to have, but an accidental second copy of a package such as React, from a pnpm peer
	 * variant or a workspace package with its own install, otherwise surfaces only as a confusing runtime error.
	 * The warning names each copy's directory and the directories of the modules that import it, once per set of
	 * copies.
	 */
	private warnOnDuplicatePackageCopies(specifier: string): void {
		const packageName = toPackageRootSpecifier(specifier);
		const copies = new Map<string, Set<string>>();
		for (const graph of this.graphs.values()) {
			for (const entry of graph.entries.values()) {
				if (toPackageRootSpecifier(entry.specifier) !== packageName) continue;
				const packageDir = findPackageDir(entry.entryPath, packageName);
				const importers = copies.get(packageDir) ?? new Set<string>();
				for (const source of entry.sources) importers.add(source.resolveDir);
				copies.set(packageDir, importers);
			}
		}
		if (copies.size < 2) return;
		const key = `${packageName}\0${[...copies.keys()].sort().join('\0')}`;
		if (this.warnedPackageCopies.has(key)) return;
		this.warnedPackageCopies.add(key);
		const lines = [...copies].map(
			([packageDir, importers]) => `  ${packageDir}\n    imported from ${[...importers].join(', ')}`,
		);
		appLogger.warn(
			`[dev-transform] Package "${packageName}" resolves to ${copies.size} installed copies, and each loads as its own module:\n${lines.join('\n')}`,
		);
	}

	private requireGraph(key: VendorGraphKey): VendorGraph {
		const graph = this.graphs.get(key);
		if (!graph) {
			throw new Error(`[dev-transform] Unknown vendor graph ${key}`);
		}
		return graph;
	}

	private waitForBuildContaining(graph: VendorGraph, entryPath: string): Promise<VendorGraphBuild> {
		const current = this.currentBuild(graph);
		if (current?.entryPaths.has(entryPath) && !isRetryDue(current, entryPath)) {
			return Promise.resolve(current);
		}
		if (graph.running?.generation === this.generation && graph.running.entryPaths.has(entryPath)) {
			return graph.running.promise;
		}
		return this.scheduleBuild(graph);
	}

	/**
	 * Schedules a build of every known entry of `graph` after a quiet period, restarting the period on each call.
	 *
	 * @remarks
	 * Builds of one graph run one at a time through its queue, and the entry list is read when a build starts, so
	 * an entry added while a build runs lands in the next one.
	 */
	private scheduleBuild(graph: VendorGraph): Promise<VendorGraphBuild> {
		if (graph.scheduled) {
			clearTimeout(graph.scheduled.timer);
			graph.scheduled.timer = setTimeout(() => this.startBuild(graph), VENDOR_GRAPH_QUIET_PERIOD_MS);
			return graph.scheduled.promise;
		}

		let resolve: (build: VendorGraphBuild) => void = () => {};
		const promise = new Promise<VendorGraphBuild>((resolvePromise) => {
			resolve = resolvePromise;
		});
		graph.scheduled = {
			promise,
			resolve,
			timer: setTimeout(() => this.startBuild(graph), VENDOR_GRAPH_QUIET_PERIOD_MS),
		};
		return promise;
	}

	private startBuild(graph: VendorGraph): void {
		const scheduled = graph.scheduled;
		if (!scheduled) {
			return;
		}
		graph.scheduled = undefined;
		graph.queue = graph.queue.then(() => this.runBuild(graph, scheduled));
	}

	private async runBuild(graph: VendorGraph, scheduled: ScheduledVendorGraphBuild): Promise<void> {
		const generation = this.generation;
		const entries = [...graph.entries.values()];
		const promise = this.buildGraph(graph, entries, new Map(graph.failed), generation);
		const running: RunningVendorGraphBuild = {
			generation,
			entryPaths: new Set(entries.map((entry) => entry.entryPath)),
			promise,
		};
		graph.running = running;

		const build = await promise;
		if (graph.running === running) {
			graph.running = undefined;
		}
		try {
			if (generation === this.generation) {
				this.commitBuild(graph, build);
			}
		} catch (error) {
			appLogger.error(`[dev-transform] Vendor graph update failed: ${String(error)}`);
		} finally {
			scheduled.resolve(build);
		}
	}

	/**
	 * @remarks
	 * A file the previous build served and this build left unchanged counts as served by this one too, so a later
	 * build that changes it still reports the change.
	 */
	private commitBuild(graph: VendorGraph, build: VendorGraphBuild): void {
		const previous = graph.current;
		graph.current = build;
		for (const [entryPath, error] of build.failed) {
			graph.failed.set(entryPath, error);
		}
		if (!previous) {
			this.persistEntries();
			return;
		}
		let changed = false;
		for (const url of previous.servedUrls) {
			if (previous.outputs.get(url) === build.outputs.get(url)) build.servedUrls.add(url);
			else changed = true;
		}
		if (changed) {
			this.onVendorGraphChange?.();
		}
		this.persistEntries();
	}

	/**
	 * Builds `entries` as one graph, isolating the entries that fail.
	 *
	 * @remarks
	 * When the graph fails, each entry builds alone to find the failing ones, and the graph builds again without
	 * them, so one broken package does not take every vendor down. Entries in `failed` are left out and keep
	 * their error. When no entry is isolated, because every entry builds alone or none does, or when anything
	 * throws, the graph failed as a whole: see {@link DevTransformVendorRegistry.keepLastGoodBuild}.
	 */
	private async buildGraph(
		graph: VendorGraph,
		entries: readonly VendorEntry[],
		knownFailed: ReadonlyMap<string, Error>,
		generation: number,
	): Promise<VendorGraphBuild> {
		const failed = new Map(knownFailed);
		const entryPaths = new Set(entries.map((entry) => entry.entryPath));
		const finish = (result?: Extract<BuildResult, { success: true }>): VendorGraphBuild => ({
			generation,
			entryPaths,
			outputs: result ? this.collectOutputs(result) : new Map(),
			commonJsEntryPaths: new Set(
				(result?.dependencyGraph.commonJsEntrypoints ?? []).map((entryPath) => path.resolve(entryPath)),
			),
			errors: failed,
			failed,
			servedUrls: new Set(),
		});
		const failGraph = (error: Error, entryErrors: ReadonlyMap<string, Error> = new Map()) =>
			this.keepLastGoodBuild(graph, { generation, entries, entryPaths, failed, error, entryErrors });

		try {
			const toBuild = entries.filter((entry) => !failed.has(entry.entryPath));
			if (toBuild.length === 0) {
				return finish();
			}

			const result = await this.bundleGraph(graph, toBuild);
			if (result.success) {
				return finish(result);
			}
			const graphError = createPrebundleError(describeEntries(toBuild), result);
			if (toBuild.length === 1) {
				return failGraph(graphError);
			}

			const isolated = await Promise.all(
				toBuild.map(async (entry) => ({ entry, result: await this.bundleGraph(graph, [entry]) })),
			);
			const isolatedErrors = new Map<string, Error>();
			for (const { entry, result: entryResult } of isolated) {
				if (!entryResult.success) {
					isolatedErrors.set(entry.entryPath, createPrebundleError(entry.specifier, entryResult));
				}
			}
			if (isolatedErrors.size === 0 || isolatedErrors.size === toBuild.length) {
				return failGraph(graphError, isolatedErrors);
			}

			for (const [entryPath, error] of isolatedErrors) failed.set(entryPath, error);
			const remaining = toBuild.filter((entry) => !failed.has(entry.entryPath));
			const retried = await this.bundleGraph(graph, remaining);
			if (!retried.success) {
				return failGraph(createPrebundleError(describeEntries(remaining), retried));
			}
			return finish(retried);
		} catch (error) {
			return failGraph(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * The build of a graph that failed as a whole: the outputs of the last build, with an error for each entry
	 * that has none.
	 *
	 * @remarks
	 * A whole-graph failure can be transient, such as one during a package install, so no entry is marked
	 * failed and the next build tries every entry again. An entry without a previous output gets its own error
	 * when it failed alone, otherwise the graph error. A request for such an entry made after a backoff schedules
	 * that next build, so the error does not stick; the backoff keeps a lasting failure from rebuilding the graph,
	 * with its per-entry isolation builds, on every request.
	 */
	private keepLastGoodBuild(
		graph: VendorGraph,
		failure: {
			generation: number;
			entries: readonly VendorEntry[];
			entryPaths: ReadonlySet<string>;
			failed: ReadonlyMap<string, Error>;
			error: Error;
			entryErrors: ReadonlyMap<string, Error>;
		},
	): VendorGraphBuild {
		const lastGood = graph.current;
		const outputs = lastGood?.outputs ?? new Map<string, string>();
		const errors = new Map<string, Error>();
		for (const entry of failure.entries) {
			if (outputs.has(entry.url)) continue;
			errors.set(
				entry.entryPath,
				failure.failed.get(entry.entryPath) ?? failure.entryErrors.get(entry.entryPath) ?? failure.error,
			);
		}
		appLogger.error(
			`[dev-transform] Vendor graph build failed; built vendors keep their last good output.\n${failure.error.message}`,
		);
		return {
			generation: failure.generation,
			entryPaths: failure.entryPaths,
			outputs,
			commonJsEntryPaths: lastGood?.commonJsEntryPaths ?? new Set(),
			errors,
			failed: failure.failed,
			servedUrls: lastGood?.servedUrls ?? new Set(),
			failedAt: Date.now(),
		};
	}

	/**
	 * Keeps the `@ecopages/core` imports of module-first packages out of their graph, pointing each at its
	 * browser-first entry URL.
	 *
	 * @remarks
	 * A package such as a router imports core's browser modules. Bundled into the module-first graph, they would
	 * be a second copy next to the browser-first one that Pages import, and would move between that graph's chunks
	 * as other packages that import them arrive. The import becomes the entry's stable URL instead, which a browser
	 * request then builds like any other entry.
	 */
	private createBrowserFirstImportsPlugin(): EcoBuildPlugin {
		return {
			name: 'ecopages-dev-vendor-browser-first-imports',
			setup: (build) => {
				build.onResolve({ filter: BROWSER_FIRST_SPECIFIER }, (args) => {
					const resolveDir =
						args.importer && path.isAbsolute(args.importer)
							? resolveImporterDir(args.importer)
							: this.rootResolveDir;
					const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, args.path, resolveDir);
					if (!resolved) return undefined;
					return { path: this.addEntry(args.path, resolveDir, resolved.path).entry.url, external: true };
				});
			},
		};
	}

	private async bundleGraph(graph: VendorGraph, entries: readonly VendorEntry[]): Promise<BuildResult> {
		const vendorPlugins = this.resolveVendorBundlePlugins ? await this.resolveVendorBundlePlugins() : [];
		const graphPlugins = graph.key === 'module-first' ? [this.createBrowserFirstImportsPlugin()] : [];
		return this.browserBundleService.bundle({
			lane: 'build',
			entrypoints: {
				...Object.fromEntries(entries.map((entry) => [path.posix.basename(entry.url, '.js'), entry.entryPath])),
				[PIN_ENTRY_NAME]: PIN_SPECIFIER,
			},
			outdir: this.resolveOutdir(),
			naming: '[name]',
			writeToDisk: false,
			minify: false,
			externalPackages: false,
			treeshaking: true,
			splitting: true,
			conditions: [...graph.conditions],
			excludeAppBuildPlugins: resolveAppBuildPlugins(this.appConfig, 'browser').map((plugin) => plugin.name),
			plugins: [createVendorPinPlugin(entries), ...graphPlugins, ...vendorPlugins],
		});
	}

	/**
	 * @remarks
	 * Every output lands in one directory, so the relative imports between entries and chunks resolve under
	 * `/assets/vendors/` in the browser as they are.
	 */
	private collectOutputs(result: Extract<BuildResult, { success: true }>): Map<string, string> {
		const outdir = this.resolveOutdir();
		const outputs = new Map<string, string>();
		for (const output of result.outputs) {
			if (typeof output.content !== 'string') continue;
			const relative = path.relative(outdir, output.path).split(path.sep).join('/');
			outputs.set(`/${RESOLVED_ASSETS_VENDORS_DIR}/${relative}`, output.content);
		}
		return outputs;
	}

	private async findOutput(url: string): Promise<VendorOutputLookup> {
		const built = this.findBuiltOutput(url);
		if (built) {
			return built;
		}

		const known = this.entriesByUrl.get(url);
		if (known) {
			const build = await this.waitForBuildContaining(known.graph, known.entry.entryPath);
			const error = build.errors.get(known.entry.entryPath);
			if (error) {
				return { error };
			}
			const content = build.outputs.get(url);
			return content === undefined ? null : { build, url, content };
		}

		return null;
	}

	/**
	 * @remarks
	 * After {@link DevTransformVendorRegistry.invalidateAll} an entry URL waits for the rebuild, but a chunk or an
	 * entry URL that is no longer known is still served from the previous build until the rebuild commits, so an
	 * open page can load its lazy chunks; a rebuild that changes a served file then reloads the page.
	 */
	private findBuiltOutput(url: string): VendorOutputLookup {
		const known = this.entriesByUrl.get(url);
		for (const graph of this.graphs.values()) {
			const build = graph.current;
			if (!build || (known && build.generation !== this.generation)) continue;
			const content = build.outputs.get(url);
			if (content !== undefined) {
				return { build, url, content };
			}
			const entryPath = known?.graph === graph ? known.entry.entryPath : undefined;
			const error = entryPath && !isRetryDue(build, entryPath) ? build.errors.get(entryPath) : undefined;
			if (error) {
				return { error };
			}
		}
		return null;
	}

	/** The graph's last build when it belongs to the current generation. */
	private currentBuild(graph: VendorGraph): VendorGraphBuild | undefined {
		return graph.current?.generation === this.generation ? graph.current : undefined;
	}

	private resolveOutdir(): string {
		return path.join(this.appConfig.absolutePaths.workDir, 'vendor-memory');
	}

	private resolveEntriesFile(): string {
		return path.join(this.appConfig.absolutePaths.workDir, VENDOR_ENTRIES_FILE);
	}

	/**
	 * Seeds the known entries from the previous dev process.
	 *
	 * @remarks
	 * A specifier that no longer resolves from its directory, or now belongs to another graph, is skipped without
	 * an error.
	 */
	private seedPersistedEntries(): void {
		const file = this.resolveEntriesFile();
		if (!fileSystem.exists(file)) {
			return;
		}

		let persisted: unknown;
		try {
			persisted = JSON.parse(fileSystem.readFileSync(file));
		} catch {
			return;
		}
		if (!isPersistedVendorEntries(persisted)) {
			return;
		}

		for (const { specifier, resolveDir, conditions } of persisted.entries) {
			if (getVendorGraphKey(specifier) !== conditions) continue;
			const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier, resolveDir);
			if (resolved) this.addEntry(specifier, resolveDir, resolved.path);
		}
	}

	/**
	 * @remarks
	 * Every known entry is written, failing ones included, so a failure never costs the next process its seed.
	 * The write is synchronous so it finishes before the build's waiters resume; a failed write only costs the
	 * next process its seed, so it is logged at debug level.
	 */
	private persistEntries(): void {
		const persisted: PersistedVendorEntries = {
			entries: [...this.graphs.values()].flatMap((graph) =>
				[...graph.entries.values()].flatMap((entry) =>
					entry.sources.map((source) => ({ ...source, conditions: graph.key })),
				),
			),
		};
		const contents = `${JSON.stringify(persisted, null, '\t')}\n`;
		if (contents === this.persistedContents) {
			return;
		}

		const file = this.resolveEntriesFile();
		try {
			fileSystem.write(file, contents);
			this.persistedContents = contents;
		} catch (error) {
			appLogger.debug(`[dev-transform] Could not write ${file}: ${String(error)}`);
		}
	}

	private resolvePackageEntry(specifier: string, resolveDir: string): string {
		const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier, resolveDir);
		if (!resolved) {
			throw new Error(
				`[dev-transform] Unable to resolve bare import "${specifier}" from ${resolveDir} for vendor prebundle`,
			);
		}

		return resolved.path;
	}

	/** Where a bare import that no module imports resolves from. */
	private get rootResolveDir(): string {
		return resolveDirectory(this.appConfig.rootDir);
	}
}

/** The `name` of a `package.json`, or `undefined` when the file is missing or unreadable. */
function readPackageName(manifest: string): string | undefined {
	if (!fileSystem.exists(manifest)) return undefined;
	try {
		const parsed: unknown = JSON.parse(fileSystem.readFileSync(manifest));
		return typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string'
			? parsed.name
			: undefined;
	} catch {
		return undefined;
	}
}

/** The installed directory of `packageName` that holds `entryPath`, or the entry's directory when none is found. */
function findPackageDir(entryPath: string, packageName: string): string {
	let directory = path.dirname(entryPath);
	while (true) {
		if (readPackageName(path.join(directory, 'package.json')) === packageName) return directory;
		const parent = path.dirname(directory);
		if (parent === directory) return path.dirname(entryPath);
		directory = parent;
	}
}

/** A directory with its symlinks resolved, or as given when it does not exist. */
function resolveDirectory(directory: string): string {
	try {
		return fileSystem.realpath(path.resolve(directory));
	} catch {
		return path.resolve(directory);
	}
}

/**
 * The directory a module's bare imports resolve from.
 *
 * @remarks
 * Symlinks are resolved first, as Node and Rolldown do, so a package linked into the pnpm store finds its own
 * dependencies beside it in the store rather than in the linking `node_modules`.
 */
function resolveImporterDir(importer: string): string {
	return resolveDirectory(path.dirname(path.resolve(importer)));
}

function createVendorGraph(key: VendorGraphKey, conditions: readonly string[]): VendorGraph {
	return { key, conditions, entries: new Map(), failed: new Map(), queue: Promise.resolve() };
}

function isPersistedVendorEntries(value: unknown): value is PersistedVendorEntries {
	if (typeof value !== 'object' || value === null || !('entries' in value) || !Array.isArray(value.entries)) {
		return false;
	}
	return value.entries.every(
		(entry: unknown) =>
			typeof entry === 'object' &&
			entry !== null &&
			'specifier' in entry &&
			typeof entry.specifier === 'string' &&
			'resolveDir' in entry &&
			typeof entry.resolveDir === 'string' &&
			'conditions' in entry &&
			(entry.conditions === 'browser-first' || entry.conditions === 'module-first'),
	);
}

/** Whether a request for an entry with no output in a build that failed as a whole should build the graph again. */
function isRetryDue(build: VendorGraphBuild, entryPath: string): boolean {
	return (
		build.failedAt !== undefined &&
		Date.now() - build.failedAt >= VENDOR_GRAPH_RETRY_BACKOFF_MS &&
		build.errors.has(entryPath) &&
		!build.failed.has(entryPath)
	);
}

function describeEntries(entries: readonly VendorEntry[]): string {
	return entries.map((entry) => entry.specifier).join(', ');
}

function createPrebundleError(specifier: string, result: BuildFailure): Error {
	return new Error(formatVendorPrebundleError(specifier, result.logs.map(formatBuildLog).join('\n')));
}

function formatVendorPrebundleError(specifier: string, details: string): string {
	if (details.includes(BROWSER_NODE_BUILTIN_GUARD_MARKER)) {
		return (
			`[dev-transform] Bare import "${specifier}" resolved to a server-only entry. ` +
			`Import a browser subpath of the package.` +
			(details ? `\n${details}` : '')
		);
	}

	return details
		? `[dev-transform] Vendor prebundle failed for ${specifier}:\n${details}`
		: `[dev-transform] Vendor prebundle failed for ${specifier}`;
}

function createVendorResponse(url: string, content: string, ifNoneMatch?: string | null): Response {
	const etag = `"${contentHash(content, 16)}"`;

	const headers = { 'Cache-Control': 'no-cache', ETag: etag };
	if (matchesIfNoneMatch(ifNoneMatch, etag)) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(content, {
		headers: { ...headers, 'Content-Type': resolveVendorContentType(url) },
	});
}

function resolveVendorContentType(url: string): string {
	if (url.endsWith('.css')) return 'text/css';
	if (url.endsWith('.map')) return 'application/json';
	return 'application/javascript';
}

function sanitizeSpecifierForFileName(specifier: string): string {
	return specifier.replaceAll(/^@/gu, '').replaceAll(/[/:@]/gu, '-');
}

/**
 * Whether an `If-None-Match` header matches `etag` under the weak comparison of
 * RFC 9110: any listed tag equal to it once `W/` is stripped, or `*`.
 */
function matchesIfNoneMatch(ifNoneMatch: string | null | undefined, etag: string): boolean {
	if (!ifNoneMatch) {
		return false;
	}

	return ifNoneMatch.split(',').some((tag) => {
		const trimmed = tag.trim();
		return trimmed === '*' || trimmed.replace(/^W\//u, '') === etag;
	});
}
