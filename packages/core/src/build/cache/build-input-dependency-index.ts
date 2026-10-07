import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

const activeIndex = new AsyncLocalStorage<BuildInputDependencyIndex>();
const collectedInputs = new AsyncLocalStorage<Set<string>>();

/**
 * Cached result kinds that share one reverse index from recorded build inputs.
 */
export type BuildInputConsumer = 'page-browser-graph' | 'html-cache' | 'entrypoint';

/**
 * One cached result bound to the files it read.
 */
export type BuildInputBinding = {
	consumer: BuildInputConsumer;
	key: string;
};

function bindingId(binding: BuildInputBinding): string {
	return `${binding.consumer}:${binding.key}`;
}

function normalizeSourcePath(filePath: string): string {
	return path.resolve(filePath);
}

/**
 * Reverse index from recorded filesystem inputs to Page Browser Graphs, HTML
 * cache entries, and browser entrypoints.
 *
 * @remarks
 * `register` unbinds the previous set for that result before binding the next,
 * so the index stays bounded. `recordWatchPath` grows the watch set for the
 * process even when no result has been committed yet.
 */
export class BuildInputDependencyIndex {
	private readonly sourceToBindingIds = new Map<string, Set<string>>();
	private readonly bindingToSources = new Map<string, Set<string>>();
	private readonly bindings = new Map<string, BuildInputBinding>();
	private readonly watchPaths = new Set<string>();
	private readonly watchListeners = new Set<(filePath: string) => void>();

	/**
	 * Records a path the build read so the Project Watcher can subscribe to it.
	 */
	recordWatchPath(filePath: string): void {
		const normalized = normalizeSourcePath(filePath);
		if (this.watchPaths.has(normalized)) {
			return;
		}

		this.watchPaths.add(normalized);
		for (const listener of this.watchListeners) {
			listener(normalized);
		}
	}

	/**
	 * Replaces the source paths for one cached result.
	 */
	register(binding: BuildInputBinding, sourcePaths: readonly string[]): void {
		this.unregister(binding);

		if (sourcePaths.length === 0) {
			return;
		}

		this.add(binding, sourcePaths);
	}

	/**
	 * Adds source paths for one cached result without dropping the previous set.
	 */
	add(binding: BuildInputBinding, sourcePaths: readonly string[]): void {
		if (sourcePaths.length === 0) {
			return;
		}

		const id = bindingId(binding);
		this.bindings.set(id, binding);
		const existing = this.bindingToSources.get(id) ?? new Set<string>();

		for (const sourcePath of sourcePaths) {
			const normalized = normalizeSourcePath(sourcePath);
			existing.add(normalized);
			this.recordWatchPath(normalized);
			const bindingIds = this.sourceToBindingIds.get(normalized) ?? new Set<string>();
			bindingIds.add(id);
			this.sourceToBindingIds.set(normalized, bindingIds);
		}

		this.bindingToSources.set(id, existing);
	}

	/**
	 * Removes specific source paths from one cached result.
	 */
	remove(binding: BuildInputBinding, sourcePaths: readonly string[]): void {
		const id = bindingId(binding);
		const existing = this.bindingToSources.get(id);
		if (!existing) {
			return;
		}

		for (const sourcePath of sourcePaths) {
			const normalized = normalizeSourcePath(sourcePath);
			existing.delete(normalized);
			this.removeBindingFromSource(normalized, id);
		}

		if (existing.size === 0) {
			this.bindingToSources.delete(id);
			this.bindings.delete(id);
		}
	}

	/**
	 * Drops every source path for one cached result.
	 */
	unregister(binding: BuildInputBinding): void {
		const id = bindingId(binding);
		const sources = this.bindingToSources.get(id);
		if (!sources) {
			return;
		}

		for (const source of sources) {
			this.removeBindingFromSource(source, id);
		}

		this.bindingToSources.delete(id);
		this.bindings.delete(id);
	}

	/**
	 * Returns every cached result that recorded `filePath`.
	 */
	resolve(filePath: string): BuildInputBinding[] {
		const bindingIds = this.sourceToBindingIds.get(normalizeSourcePath(filePath));
		if (!bindingIds) {
			return [];
		}

		const resolved: BuildInputBinding[] = [];
		for (const id of bindingIds) {
			const binding = this.bindings.get(id);
			if (binding) {
				resolved.push(binding);
			}
		}
		return resolved;
	}

	/**
	 * Returns result keys for one consumer that recorded `filePath`.
	 */
	resolveKeys(consumer: BuildInputConsumer, filePath: string): string[] {
		return this.resolve(filePath)
			.filter((binding) => binding.consumer === consumer)
			.map((binding) => binding.key);
	}

	/**
	 * Returns whether any cached result recorded `filePath`.
	 */
	hasSourcePath(filePath: string): boolean {
		return this.sourceToBindingIds.has(normalizeSourcePath(filePath));
	}

	/**
	 * Paths the watcher should subscribe to, including processor watch roots.
	 */
	recordedWatchPaths(): string[] {
		return [...this.watchPaths];
	}

	/**
	 * Notifies `listener` the first time each later path is recorded.
	 */
	subscribeToWatchPaths(listener: (filePath: string) => void): () => void {
		this.watchListeners.add(listener);
		return () => {
			this.watchListeners.delete(listener);
		};
	}

	/**
	 * Drops every binding for one consumer. Watch paths stay recorded.
	 */
	clearConsumer(consumer: BuildInputConsumer): void {
		for (const binding of [...this.bindings.values()]) {
			if (binding.consumer === consumer) {
				this.unregister(binding);
			}
		}
	}

	clear(): void {
		this.sourceToBindingIds.clear();
		this.bindingToSources.clear();
		this.bindings.clear();
	}

	private removeBindingFromSource(source: string, id: string): void {
		const bindingIds = this.sourceToBindingIds.get(source);
		if (!bindingIds) {
			return;
		}

		bindingIds.delete(id);
		if (bindingIds.size === 0) {
			this.sourceToBindingIds.delete(source);
		}
	}
}

const indexByAppConfig = new WeakMap<EcoPagesAppConfig, BuildInputDependencyIndex>();

/**
 * Records a filesystem path the current build read.
 *
 * @remarks
 * No-op when no index is active. Plugin loads always also call Rolldown
 * `this.addWatchFile` when that method exists.
 */
export function recordLoadedBuildInput(filePath: string): void {
	const normalized = path.resolve(filePath);
	collectedInputs.getStore()?.add(normalized);
	activeIndex.getStore()?.recordWatchPath(normalized);
}

/**
 * Extra filesystem paths `addDependency` recorded during the current build.
 */
export function collectedLoadedBuildInputs(): readonly string[] {
	return [...(collectedInputs.getStore() ?? [])];
}

/**
 * Runs `fn` with `index` receiving every `addDependency` and loaded path.
 */
export function runWithBuildInputIndex<T>(index: BuildInputDependencyIndex, fn: () => T): T {
	return activeIndex.run(index, () => collectedInputs.run(new Set(), fn));
}

/**
 * Seeds Processor watch directories into the recorded watch set.
 *
 * @remarks
 * Those directories are declared reads (content collections, scanned CSS). They
 * are not bound to a Page until a build records the files inside them.
 */
export function seedProcessorWatchPaths(appConfig: EcoPagesAppConfig, index: BuildInputDependencyIndex): void {
	for (const processor of appConfig.processors?.values() ?? []) {
		const watchConfig = processor.getWatchConfig?.();
		for (const watchPath of watchConfig?.paths ?? []) {
			index.recordWatchPath(watchPath);
		}
	}
}

/**
 * Returns the app-owned reverse index, creating it on first use.
 */
export function getAppBuildInputIndex(appConfig: EcoPagesAppConfig): BuildInputDependencyIndex {
	const existing = appConfig.runtime?.buildInputIndex;
	if (existing) {
		seedProcessorWatchPaths(appConfig, existing);
		return existing;
	}

	const cached = indexByAppConfig.get(appConfig);
	if (cached) {
		seedProcessorWatchPaths(appConfig, cached);
		return cached;
	}

	const index = new BuildInputDependencyIndex();
	seedProcessorWatchPaths(appConfig, index);
	indexByAppConfig.set(appConfig, index);
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildInputIndex: index,
	};
	return index;
}
