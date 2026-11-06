import { contentHash } from '../../utils/content-hash.ts';
import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../../constants.ts';
import { resolveAppBuildPlugins } from '../../build/runtime/build-request-policy.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import type { BuildFailure, BuildResult } from '../../build/contracts/build-contracts.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../plugins/package-specifier.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { formatBuildLog } from '../../build/build-log.ts';
import { appLogger } from '../../global/app-logger.ts';

const BROWSER_FIRST_VENDOR_CONDITIONS = ['browser', 'module', 'import', 'default'] as const;
const MODULE_FIRST_VENDOR_CONDITIONS = ['module', 'import', 'default'] as const;
const BROWSER_NODE_BUILTIN_GUARD_MARKER = '[browser-build] Node builtin';
const VENDOR_GRAPH_QUIET_PERIOD_MS = 50;
const VENDOR_ENTRIES_FILE = 'dev-vendor-entries.json';

type VendorGraphKey = 'browser-first' | 'module-first';

/** One known dependency entry: a bare specifier and the package file it resolves to. */
type VendorEntry = {
	specifier: string;
	entryPath: string;
	url: string;
};

/** The result of one build of a vendor graph. */
type VendorGraphBuild = {
	entryPaths: ReadonlySet<string>;
	/** Output contents keyed by served URL: entries and shared chunks. */
	outputs: ReadonlyMap<string, string>;
	errors: ReadonlyMap<string, Error>;
	/** URLs of this build that a browser has received. */
	servedUrls: Set<string>;
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
 * own graph. Inside one graph a module has exactly one chunk; a package that both graphs reach loads once per
 * graph.
 */
type VendorGraph = {
	key: VendorGraphKey;
	conditions: readonly string[];
	entries: Map<string, VendorEntry>;
	/** Entries that failed in this generation; they stay out of later builds until {@link DevTransformVendorRegistry.invalidateAll}. */
	failed: Map<string, Error>;
	current?: VendorGraphBuild;
	scheduled?: ScheduledVendorGraphBuild;
	running?: RunningVendorGraphBuild;
	/** Serializes the builds of the graph. */
	queue: Promise<void>;
};

type PersistedVendorEntries = {
	entries: { specifier: string; conditions: VendorGraphKey }[];
};

type VendorOutputLookup = { build: VendorGraphBuild; url: string; content: string } | { error: Error } | null;

function getVendorGraphKey(specifier: string): VendorGraphKey {
	return toPackageRootSpecifier(specifier) === '@ecopages/core' ? 'browser-first' : 'module-first';
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
 */
export class DevTransformVendorRegistry {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
	private readonly onVendorGraphChange?: () => void;
	private readonly graphs = new Map<VendorGraphKey, VendorGraph>();
	private readonly entriesByUrl = new Map<string, { graph: VendorGraph; entry: VendorEntry }>();
	private generation = 0;
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
	 * @remarks
	 * Rejects with the prebundle error when the entry failed to build.
	 */
	async resolveVendorUrl(specifier: string): Promise<string> {
		const entryPath = this.resolvePackageEntry(specifier);
		const { graph, entry } = this.addEntry(specifier, entryPath);
		const build = await this.waitForBuildContaining(graph, entry.entryPath);
		const error = build.errors.get(entry.entryPath);
		if (error) {
			throw error;
		}
		return entry.url;
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
	 * Drops every built output so the next request rebuilds it, keeping the known entries.
	 *
	 * @remarks
	 * A build that started before this call still settles for its waiters but is not kept.
	 */
	invalidateAll(): void {
		this.generation += 1;
		for (const graph of this.graphs.values()) {
			graph.current = undefined;
			graph.failed.clear();
		}
	}

	private addEntry(specifier: string, entryPath: string): { graph: VendorGraph; entry: VendorEntry } {
		const graph = this.requireGraph(getVendorGraphKey(specifier));
		const existing = graph.entries.get(entryPath);
		if (existing) {
			return { graph, entry: existing };
		}

		const entry: VendorEntry = {
			specifier,
			entryPath,
			url: `/${RESOLVED_ASSETS_VENDORS_DIR}/${sanitizeSpecifierForFileName(specifier)}.${contentHash(entryPath, 8)}.js`,
		};
		graph.entries.set(entryPath, entry);
		this.entriesByUrl.set(entry.url, { graph, entry });
		return { graph, entry };
	}

	private requireGraph(key: VendorGraphKey): VendorGraph {
		const graph = this.graphs.get(key);
		if (!graph) {
			throw new Error(`[dev-transform] Unknown vendor graph ${key}`);
		}
		return graph;
	}

	private waitForBuildContaining(graph: VendorGraph, entryPath: string): Promise<VendorGraphBuild> {
		if (graph.current?.entryPaths.has(entryPath)) {
			return Promise.resolve(graph.current);
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
		const promise = this.buildGraph(graph, entries, new Map(graph.failed));
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

	private commitBuild(graph: VendorGraph, build: VendorGraphBuild): void {
		const previous = graph.current;
		graph.current = build;
		for (const [entryPath, error] of build.errors) {
			graph.failed.set(entryPath, error);
		}
		if (previous && [...previous.servedUrls].some((url) => previous.outputs.get(url) !== build.outputs.get(url))) {
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
	 * their error.
	 */
	private async buildGraph(
		graph: VendorGraph,
		entries: readonly VendorEntry[],
		failed: ReadonlyMap<string, Error>,
	): Promise<VendorGraphBuild> {
		const errors = new Map(failed);
		const toBuild = entries.filter((entry) => !errors.has(entry.entryPath));
		const finish = (outputs: ReadonlyMap<string, string>): VendorGraphBuild => ({
			entryPaths: new Set(entries.map((entry) => entry.entryPath)),
			outputs,
			errors,
			servedUrls: new Set(),
		});
		const failAll = (failing: readonly VendorEntry[], error: Error) => {
			for (const entry of failing) errors.set(entry.entryPath, error);
		};

		try {
			if (toBuild.length === 0) {
				return finish(new Map());
			}

			const result = await this.bundleGraph(graph, toBuild);
			if (result.success) {
				return finish(this.collectOutputs(result));
			}
			if (toBuild.length === 1) {
				failAll(toBuild, createPrebundleError(toBuild[0].specifier, result));
				return finish(new Map());
			}

			const isolated = await Promise.all(
				toBuild.map(async (entry) => ({ entry, result: await this.bundleGraph(graph, [entry]) })),
			);
			for (const { entry, result: entryResult } of isolated) {
				if (!entryResult.success) failAll([entry], createPrebundleError(entry.specifier, entryResult));
			}

			const remaining = toBuild.filter((entry) => !errors.has(entry.entryPath));
			if (remaining.length === toBuild.length) {
				failAll(toBuild, createPrebundleError(describeEntries(toBuild), result));
				return finish(new Map());
			}
			if (remaining.length === 0) {
				return finish(new Map());
			}

			const retried = await this.bundleGraph(graph, remaining);
			if (!retried.success) {
				failAll(remaining, createPrebundleError(describeEntries(remaining), retried));
				return finish(new Map());
			}
			return finish(this.collectOutputs(retried));
		} catch (error) {
			failAll(toBuild, error instanceof Error ? error : new Error(String(error)));
			return finish(new Map());
		}
	}

	private async bundleGraph(graph: VendorGraph, entries: readonly VendorEntry[]): Promise<BuildResult> {
		const vendorPlugins = this.resolveVendorBundlePlugins ? await this.resolveVendorBundlePlugins() : [];
		return this.browserBundleService.bundle({
			lane: 'build',
			entrypoints: Object.fromEntries(
				entries.map((entry) => [path.posix.basename(entry.url, '.js'), entry.entryPath]),
			),
			outdir: this.resolveOutdir(),
			naming: '[name]',
			writeToDisk: false,
			minify: false,
			externalPackages: false,
			treeshaking: true,
			splitting: true,
			conditions: [...graph.conditions],
			excludeAppBuildPlugins: resolveAppBuildPlugins(this.appConfig, 'browser').map((plugin) => plugin.name),
			plugins: [...vendorPlugins],
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

	private findBuiltOutput(url: string): VendorOutputLookup {
		for (const graph of this.graphs.values()) {
			const build = graph.current;
			const content = build?.outputs.get(url);
			if (build && content !== undefined) {
				return { build, url, content };
			}
			const known = this.entriesByUrl.get(url);
			const error = known?.graph === graph ? build?.errors.get(known.entry.entryPath) : undefined;
			if (error) {
				return { error };
			}
		}
		return null;
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
	 * A specifier that no longer resolves, or now belongs to another graph, is skipped without an error.
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

		for (const { specifier, conditions } of persisted.entries) {
			if (getVendorGraphKey(specifier) !== conditions) continue;
			const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier, this.appConfig.rootDir);
			if (resolved) this.addEntry(specifier, resolved.path);
		}
	}

	/**
	 * @remarks
	 * The write is synchronous so it finishes before the build's waiters resume; a failure only costs the next
	 * process its seed, so it is logged at debug level.
	 */
	private persistEntries(): void {
		const persisted: PersistedVendorEntries = {
			entries: [...this.graphs.values()].flatMap((graph) =>
				[...graph.entries.values()]
					.filter((entry) => !graph.failed.has(entry.entryPath))
					.map((entry) => ({ specifier: entry.specifier, conditions: graph.key })),
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

	private resolvePackageEntry(specifier: string): string {
		const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier, this.appConfig.rootDir);
		if (!resolved) {
			throw new Error(`[dev-transform] Unable to resolve bare import "${specifier}" for vendor prebundle`);
		}

		return resolved.path;
	}
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
			'conditions' in entry &&
			(entry.conditions === 'browser-first' || entry.conditions === 'module-first'),
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
			`Import a browser subpath or register the package in the browser runtime manifest.` +
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
