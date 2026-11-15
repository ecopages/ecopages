/**
 * Bench environment helpers for kitchen-sink performance suites.
 *
 * @remarks
 * `NODE_ENV` is not among the flags: `run.mts` fixes it per process, because `react` picks its build from it on
 * first import and a later switch mixes development and production React.
 */

export type BenchEnvSnapshot = {
	unifiedPagesGraph?: string;
	rolldownBuildMetrics?: string;
};

export function snapshotBenchEnv(): BenchEnvSnapshot {
	return {
		unifiedPagesGraph: process.env.ECOPAGES_UNIFIED_PAGES_GRAPH,
		rolldownBuildMetrics: process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS,
	};
}

export function restoreBenchEnv(snapshot: BenchEnvSnapshot): void {
	if (snapshot.unifiedPagesGraph === undefined) {
		delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
	} else {
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = snapshot.unifiedPagesGraph;
	}

	if (snapshot.rolldownBuildMetrics === undefined) {
		delete process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;
	} else {
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = snapshot.rolldownBuildMetrics;
	}
}

export async function withBenchEnv<T>(
	overrides: {
		unifiedPagesGraph?: 'off' | 'default';
		rolldownBuildMetrics?: boolean;
	},
	run: () => Promise<T>,
): Promise<T> {
	const snapshot = snapshotBenchEnv();

	if (overrides.unifiedPagesGraph === 'off') {
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '0';
	} else if (overrides.unifiedPagesGraph === 'default') {
		delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
	}

	if (overrides.rolldownBuildMetrics) {
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';
	}

	try {
		return await run();
	} finally {
		restoreBenchEnv(snapshot);
	}
}
