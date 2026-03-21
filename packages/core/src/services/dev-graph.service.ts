import path from 'node:path';
import type { EcoPagesAppConfig } from '../internal-types.ts';

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
export interface DevGraphService {
	/**
	 * Returns the current server-module invalidation version.
	 *
	 * @remarks
	 * Server-side module caches include this version in their cache keys so the
	 * framework can invalidate them without relying on process-global watcher
	 * policy.
	 */
	getServerInvalidationVersion(): number;

	/**
	 * Invalidates server-side module caches for the given changed files.
	 *
	 * @remarks
	 * The current graph implementations use a coarse version bump. The
	 * `changedFiles` input is still threaded through now so later work can make
	 * selective invalidation graph-driven without changing callers again.
	 */
	invalidateServerModules(changedFiles?: string[]): void;

	supportsSelectiveInvalidation(): boolean;
	getDependencyEntrypoints(filePath: string): Set<string>;
	setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void;
	clearEntrypointDependencies(entrypointPath: string): void;
	reset(): void;
}

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
	private serverInvalidationVersion = 0;

	/**
	 * Returns the current coarse invalidation version.
	 */
	getServerInvalidationVersion(): number {
		return this.serverInvalidationVersion;
	}

	/**
	 * Invalidates all server-side module state by incrementing the shared version.
	 */
	invalidateServerModules(_changedFiles?: string[]): void {
		this.serverInvalidationVersion += 1;
	}

	/**
	 * Indicates that this graph cannot target invalidation to one entrypoint set.
	 */
	supportsSelectiveInvalidation(): boolean {
		return false;
	}

	/**
	 * Returns an empty entrypoint set because this implementation stores no
	 * dependency graph metadata.
	 */
	getDependencyEntrypoints(_filePath: string): Set<string> {
		return new Set();
	}

	/**
	 * Accepts dependency updates to preserve interface compatibility, but stores no
	 * graph state in the noop implementation.
	 */
	setEntrypointDependencies(_entrypointPath: string, _dependencies: string[]): void {}

	/**
	 * Clears one entrypoint from the graph.
	 *
	 * @remarks
	 * There is no stored graph state in this implementation, so this is a no-op.
	 */
	clearEntrypointDependencies(_entrypointPath: string): void {}

	/**
	 * Resets graph-owned state for a fresh runtime cycle.
	 */
	reset(): void {
		this.serverInvalidationVersion += 1;
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
	private readonly dependencyEntrypoints = new Map<string, Set<string>>();
	private readonly entrypointDependencies = new Map<string, Set<string>>();
	private serverInvalidationVersion = 0;

	/**
	 * Returns the current app-local server invalidation version.
	 */
	getServerInvalidationVersion(): number {
		return this.serverInvalidationVersion;
	}

	/**
	 * Invalidates the current server-module cache generation.
	 *
	 * @remarks
	 * The current implementation still uses a coarse generation bump for server
	 * modules. Selective dependency lookups are used by callers that need to limit
	 * browser rebuild work.
	 */
	invalidateServerModules(_changedFiles?: string[]): void {
		this.serverInvalidationVersion += 1;
	}

	/**
	 * Indicates that this graph can answer dependency-to-entrypoint lookups.
	 */
	supportsSelectiveInvalidation(): boolean {
		return true;
	}

	/**
	 * Returns all known entrypoints that currently depend on the given file.
	 */
	getDependencyEntrypoints(filePath: string): Set<string> {
		return new Set(this.dependencyEntrypoints.get(path.resolve(filePath)) ?? []);
	}

	/**
	 * Replaces the stored dependency set for one entrypoint.
	 *
	 * @remarks
	 * The entrypoint itself is always included in its own dependency set so reverse
	 * lookups can map a changed entry file back to that same entrypoint.
	 */
	setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);

		this.clearEntrypointDependencies(normalizedEntrypoint);

		const normalizedDependencies = new Set<string>([
			normalizedEntrypoint,
			...dependencies.map((dependencyPath) => path.resolve(dependencyPath)),
		]);

		this.entrypointDependencies.set(normalizedEntrypoint, normalizedDependencies);

		for (const dependencyPath of normalizedDependencies) {
			const entrypoints = this.dependencyEntrypoints.get(dependencyPath) ?? new Set<string>();
			entrypoints.add(normalizedEntrypoint);
			this.dependencyEntrypoints.set(dependencyPath, entrypoints);
		}
	}

	/**
	 * Removes one entrypoint and all of its reverse dependency edges.
	 */
	clearEntrypointDependencies(entrypointPath: string): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		const previousDependencies = this.entrypointDependencies.get(normalizedEntrypoint);

		if (!previousDependencies) {
			return;
		}

		for (const dependencyPath of previousDependencies) {
			const entrypoints = this.dependencyEntrypoints.get(dependencyPath);
			if (!entrypoints) {
				continue;
			}

			entrypoints.delete(normalizedEntrypoint);
			if (entrypoints.size === 0) {
				this.dependencyEntrypoints.delete(dependencyPath);
			}
		}

		this.entrypointDependencies.delete(normalizedEntrypoint);
	}

	/**
	 * Clears all graph state and starts a fresh invalidation generation.
	 */
	reset(): void {
		this.dependencyEntrypoints.clear();
		this.entrypointDependencies.clear();
		this.serverInvalidationVersion += 1;
	}
}

/**
 * Returns the dev-graph service owned by one app instance.
 */
export function getAppDevGraphService(appConfig: EcoPagesAppConfig): DevGraphService {
	return appConfig.runtime?.devGraphService ?? new NoopDevGraphService();
}

/**
 * Installs the dev-graph service that should back one app/runtime instance.
 */
export function setAppDevGraphService(appConfig: EcoPagesAppConfig, devGraphService: DevGraphService): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		devGraphService,
	};
}
