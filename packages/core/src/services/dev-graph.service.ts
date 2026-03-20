import path from 'node:path';
import type { EcoPagesAppConfig } from '../internal-types.ts';

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

export class NoopDevGraphService implements DevGraphService {
	private serverInvalidationVersion = 0;

	getServerInvalidationVersion(): number {
		return this.serverInvalidationVersion;
	}

	invalidateServerModules(_changedFiles?: string[]): void {
		this.serverInvalidationVersion += 1;
	}

	supportsSelectiveInvalidation(): boolean {
		return false;
	}

	getDependencyEntrypoints(_filePath: string): Set<string> {
		return new Set();
	}

	setEntrypointDependencies(_entrypointPath: string, _dependencies: string[]): void {}

	clearEntrypointDependencies(_entrypointPath: string): void {}

	reset(): void {
		this.serverInvalidationVersion += 1;
	}
}

export class InMemoryDevGraphService implements DevGraphService {
	private readonly dependencyEntrypoints = new Map<string, Set<string>>();
	private readonly entrypointDependencies = new Map<string, Set<string>>();
	private serverInvalidationVersion = 0;

	getServerInvalidationVersion(): number {
		return this.serverInvalidationVersion;
	}

	invalidateServerModules(_changedFiles?: string[]): void {
		this.serverInvalidationVersion += 1;
	}

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
		this.serverInvalidationVersion += 1;
	}
}

export function getAppDevGraphService(appConfig: EcoPagesAppConfig): DevGraphService {
	return appConfig.runtime?.devGraphService ?? new NoopDevGraphService();
}

export function setAppDevGraphService(appConfig: EcoPagesAppConfig, devGraphService: DevGraphService): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		devGraphService,
	};
}