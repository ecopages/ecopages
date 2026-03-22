import path from 'node:path';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { DevGraphService } from './dev-graph.service.ts';

/**
 * App-owned dependency graph used to target browser entrypoint rebuilds.
 */
export interface EntrypointDependencyGraph {
	supportsSelectiveInvalidation(): boolean;
	getDependencyEntrypoints(filePath: string): Set<string>;
	setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void;
	clearEntrypointDependencies(entrypointPath: string): void;
	reset(): void;
}

/**
 * Graph implementation for runtimes that rebuild every watched entrypoint.
 */
export class NoopEntrypointDependencyGraph implements EntrypointDependencyGraph {
	supportsSelectiveInvalidation(): boolean {
		return false;
	}

	getDependencyEntrypoints(_filePath: string): Set<string> {
		return new Set();
	}

	setEntrypointDependencies(_entrypointPath: string, _dependencies: string[]): void {}

	clearEntrypointDependencies(_entrypointPath: string): void {}

	reset(): void {}
}

/**
 * In-memory entrypoint-to-dependency graph with reverse dependency lookups.
 */
export class InMemoryEntrypointDependencyGraph implements EntrypointDependencyGraph {
	private readonly dependencyEntrypoints = new Map<string, Set<string>>();
	private readonly entrypointDependencies = new Map<string, Set<string>>();

	supportsSelectiveInvalidation(): boolean {
		return true;
	}

	getDependencyEntrypoints(filePath: string): Set<string> {
		return new Set(this.dependencyEntrypoints.get(path.resolve(filePath)) ?? []);
	}

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

	reset(): void {
		this.dependencyEntrypoints.clear();
		this.entrypointDependencies.clear();
	}
}

function isLegacyEntrypointDependencyGraph(value: unknown): value is DevGraphService {
	return (
		Boolean(value) &&
		typeof value === 'object' &&
		typeof (value as EntrypointDependencyGraph).supportsSelectiveInvalidation === 'function' &&
		typeof (value as EntrypointDependencyGraph).getDependencyEntrypoints === 'function' &&
		typeof (value as EntrypointDependencyGraph).setEntrypointDependencies === 'function' &&
		typeof (value as EntrypointDependencyGraph).clearEntrypointDependencies === 'function' &&
		typeof (value as EntrypointDependencyGraph).reset === 'function'
	);
}

/**
 * Returns the app-owned entrypoint dependency graph.
 */
export function getAppEntrypointDependencyGraph(appConfig: EcoPagesAppConfig): EntrypointDependencyGraph {
	if (appConfig.runtime?.entrypointDependencyGraph) {
		return appConfig.runtime.entrypointDependencyGraph;
	}

	if (isLegacyEntrypointDependencyGraph(appConfig.runtime?.devGraphService)) {
		return appConfig.runtime.devGraphService;
	}

	return new NoopEntrypointDependencyGraph();
}

/**
 * Installs the dependency graph used by one app instance.
 */
export function setAppEntrypointDependencyGraph(
	appConfig: EcoPagesAppConfig,
	entrypointDependencyGraph: EntrypointDependencyGraph,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		entrypointDependencyGraph,
	};
}
