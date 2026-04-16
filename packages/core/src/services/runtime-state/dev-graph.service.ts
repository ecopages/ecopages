import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import {
	CounterServerInvalidationState,
	getAppServerInvalidationState,
	setAppServerInvalidationState,
	type ServerInvalidationState,
} from './server-invalidation-state.service.ts';
import {
	getAppEntrypointDependencyGraph,
	InMemoryEntrypointDependencyGraph,
	NoopEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from './entrypoint-dependency-graph.service.ts';

/**
 * Tracks development-time dependency relationships and invalidation state for
 * one Ecopages app instance.
 *
 * @remarks
 * The current contract stays intentionally small. It supports today's needs for
 * server-module cache invalidation and entrypoint-to-dependency lookups without
 * forcing the rest of the runtime to know about one specific graph
 * implementation.
 */
export interface DevGraphService extends ServerInvalidationState, EntrypointDependencyGraph {}

/**
 * Minimal dev-graph implementation used when an app has no selective graph
 * metadata available.
 *
 * @remarks
 * This preserves correct behavior by using coarse invalidation version bumps.
 * Callers still pass changed-file information through the interface now so a
 * richer graph can become more selective later without changing call sites.
 */
export class NoopDevGraphService implements DevGraphService {
	private readonly invalidationState = new CounterServerInvalidationState();
	private readonly dependencyGraph = new NoopEntrypointDependencyGraph();

	/**
	 * Returns the current coarse invalidation version.
	 */
	getServerInvalidationVersion(): number {
		return this.invalidationState.getServerInvalidationVersion();
	}

	/**
	 * Invalidates all server-side module state by incrementing the shared version.
	 */
	invalidateServerModules(changedFiles?: string[]): void {
		this.invalidationState.invalidateServerModules(changedFiles);
	}

	/**
	 * Indicates that this graph cannot target invalidation to one entrypoint set.
	 */
	supportsSelectiveInvalidation(): boolean {
		return this.dependencyGraph.supportsSelectiveInvalidation();
	}

	/**
	 * Returns an empty entrypoint set because this implementation stores no
	 * dependency graph metadata.
	 */
	getDependencyEntrypoints(filePath: string): Set<string> {
		return this.dependencyGraph.getDependencyEntrypoints(filePath);
	}

	/**
	 * Accepts dependency updates to preserve interface compatibility, but stores no
	 * graph state in the noop implementation.
	 */
	setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void {
		this.dependencyGraph.setEntrypointDependencies(entrypointPath, dependencies);
	}

	/**
	 * Clears one entrypoint from the graph.
	 *
	 * @remarks
	 * There is no stored graph state in this implementation, so this is a no-op.
	 */
	clearEntrypointDependencies(entrypointPath: string): void {
		this.dependencyGraph.clearEntrypointDependencies(entrypointPath);
	}

	/**
	 * Resets graph-owned state for a fresh runtime cycle.
	 */
	reset(): void {
		this.invalidationState.reset();
		this.dependencyGraph.reset();
	}
}

/**
 * In-memory development graph with entrypoint-to-dependency reverse lookups.
 *
 * @remarks
 * This is the current selective graph implementation used by development flows
 * that need to answer which entrypoints depend on a changed file while still
 * keeping invalidation state app-local.
 */
export class InMemoryDevGraphService implements DevGraphService {
	private readonly invalidationState = new CounterServerInvalidationState();
	private readonly dependencyGraph = new InMemoryEntrypointDependencyGraph();

	/**
	 * Returns the current app-local server invalidation version.
	 */
	getServerInvalidationVersion(): number {
		return this.invalidationState.getServerInvalidationVersion();
	}

	/**
	 * Invalidates the current server-module cache generation.
	 *
	 * @remarks
	 * The current implementation still uses a coarse generation bump for server
	 * modules. Selective dependency lookups are used by callers that need to limit
	 * browser rebuild work.
	 */
	invalidateServerModules(changedFiles?: string[]): void {
		this.invalidationState.invalidateServerModules(changedFiles);
	}

	/**
	 * Indicates that this graph can answer dependency-to-entrypoint lookups.
	 */
	supportsSelectiveInvalidation(): boolean {
		return this.dependencyGraph.supportsSelectiveInvalidation();
	}

	/**
	 * Returns all known entrypoints that currently depend on the given file.
	 */
	getDependencyEntrypoints(filePath: string): Set<string> {
		return this.dependencyGraph.getDependencyEntrypoints(filePath);
	}

	/**
	 * Replaces the stored dependency set for one entrypoint.
	 *
	 * @remarks
	 * The entrypoint itself is always included in its own dependency set so reverse
	 * lookups can map a changed entry file back to that same entrypoint.
	 */
	setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void {
		this.dependencyGraph.setEntrypointDependencies(entrypointPath, dependencies);
	}

	/**
	 * Removes one entrypoint and all of its reverse dependency edges.
	 */
	clearEntrypointDependencies(entrypointPath: string): void {
		this.dependencyGraph.clearEntrypointDependencies(entrypointPath);
	}

	/**
	 * Clears all graph state and starts a fresh invalidation generation.
	 */
	reset(): void {
		this.invalidationState.reset();
		this.dependencyGraph.reset();
	}
}

/**
 * Returns the dev-graph service owned by one app instance.
 */
export function getAppDevGraphService(appConfig: EcoPagesAppConfig): DevGraphService {
	if (appConfig.runtime?.devGraphService) {
		return appConfig.runtime.devGraphService;
	}

	const serverInvalidationState = getAppServerInvalidationState(appConfig);
	const entrypointDependencyGraph = getAppEntrypointDependencyGraph(appConfig);

	return {
		getServerInvalidationVersion: () => serverInvalidationState.getServerInvalidationVersion(),
		invalidateServerModules: (changedFiles) => serverInvalidationState.invalidateServerModules(changedFiles),
		supportsSelectiveInvalidation: () => entrypointDependencyGraph.supportsSelectiveInvalidation(),
		getDependencyEntrypoints: (filePath) => entrypointDependencyGraph.getDependencyEntrypoints(filePath),
		setEntrypointDependencies: (entrypointPath, dependencies) =>
			entrypointDependencyGraph.setEntrypointDependencies(entrypointPath, dependencies),
		clearEntrypointDependencies: (entrypointPath) =>
			entrypointDependencyGraph.clearEntrypointDependencies(entrypointPath),
		reset: () => {
			serverInvalidationState.reset();
			entrypointDependencyGraph.reset();
		},
	};
}

/**
 * Installs the dev-graph service that should back one app/runtime instance.
 */
export function setAppDevGraphService(appConfig: EcoPagesAppConfig, devGraphService: DevGraphService): void {
	setAppServerInvalidationState(appConfig, {
		getServerInvalidationVersion: () => devGraphService.getServerInvalidationVersion(),
		invalidateServerModules: (changedFiles) => devGraphService.invalidateServerModules(changedFiles),
		reset: () => devGraphService.reset(),
	});
	setAppEntrypointDependencyGraph(appConfig, {
		supportsSelectiveInvalidation: () => devGraphService.supportsSelectiveInvalidation(),
		getDependencyEntrypoints: (filePath) => devGraphService.getDependencyEntrypoints(filePath),
		setEntrypointDependencies: (entrypointPath, dependencies) =>
			devGraphService.setEntrypointDependencies(entrypointPath, dependencies),
		clearEntrypointDependencies: (entrypointPath) => devGraphService.clearEntrypointDependencies(entrypointPath),
		reset: () => devGraphService.reset(),
	});
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		devGraphService,
	};
}
