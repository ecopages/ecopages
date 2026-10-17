import path from 'node:path';
import { BuildInputDependencyIndex } from '../build/cache/build-input-dependency-index.ts';

/**
 * HMR-owned in-memory dependency graph with reverse lookups for watched entrypoints.
 */
export class InMemoryEntrypointDependencyGraph {
	private readonly inputIndex: BuildInputDependencyIndex;

	constructor(inputIndex: BuildInputDependencyIndex = new BuildInputDependencyIndex()) {
		this.inputIndex = inputIndex;
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
