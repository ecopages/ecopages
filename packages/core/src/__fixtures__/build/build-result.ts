import type { BuildFailure, BuildLog, BuildResult, BuildSuccess } from '../../build/build-adapter.ts';

/** A successful build result with every field empty unless overridden. */
export function createBuildSuccess(overrides: Partial<BuildSuccess> = {}): BuildSuccess {
	return {
		success: true,
		outputs: [],
		warnings: [],
		loadedInputs: [],
		loadedInputsByModule: {},
		dependencyGraph: { entrypoints: {} },
		entryOutputs: {},
		outputGraph: {},
		...overrides,
	};
}

/** A failed build result with the given logs. */
export function createBuildFailure(logs: BuildLog[] = []): BuildFailure {
	return { success: false, logs };
}

/** Fails the test unless the build failed, and narrows the result for its logs. */
export function assertBuildFailed(result: BuildResult): asserts result is BuildFailure {
	if (result.success) {
		throw new Error(`Expected the build to fail, but it emitted ${result.outputs.length} output(s).`);
	}
}
