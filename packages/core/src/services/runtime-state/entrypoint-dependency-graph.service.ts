import path from 'node:path';
import { BuildInputDependencyIndex } from '../../build/cache/build-input-dependency-index.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

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
	private readonly inputIndex: BuildInputDependencyIndex;

	constructor(inputIndex: BuildInputDependencyIndex = new BuildInputDependencyIndex()) {
		this.inputIndex = inputIndex;
	}

	supportsSelectiveInvalidation(): boolean {
		return true;
	}

	getDependencyEntrypoints(filePath: string): Set<string> {
		return new Set(this.inputIndex.resolveKeys('entrypoint', filePath));
	}

	setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		this.inputIndex.register({ consumer: 'entrypoint', key: normalizedEntrypoint }, [
			normalizedEntrypoint,
			...dependencies,
		]);
	}

	clearEntrypointDependencies(entrypointPath: string): void {
		this.inputIndex.unregister({ consumer: 'entrypoint', key: path.resolve(entrypointPath) });
	}

	reset(): void {
		this.inputIndex.clearConsumer('entrypoint');
	}
}

/**
 * Returns the app-owned entrypoint dependency graph.
 */
export function getAppEntrypointDependencyGraph(appConfig: EcoPagesAppConfig): EntrypointDependencyGraph {
	if (appConfig.runtime?.entrypointDependencyGraph) {
		return appConfig.runtime.entrypointDependencyGraph;
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
