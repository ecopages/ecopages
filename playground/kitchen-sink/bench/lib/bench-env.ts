/**
 * Bench environment helpers for kitchen-sink performance suites.
 */

export type BenchEnvSnapshot = {
	nodeEnv?: string;
	unifiedPagesGraph?: string;
	rolldownBuildMetrics?: string;
};

export function snapshotBenchEnv(): BenchEnvSnapshot {
	return {
		nodeEnv: process.env.NODE_ENV,
		unifiedPagesGraph: process.env.ECOPAGES_UNIFIED_PAGES_GRAPH,
		rolldownBuildMetrics: process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS,
	};
}

export function restoreBenchEnv(snapshot: BenchEnvSnapshot): void {
	if (snapshot.nodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = snapshot.nodeEnv;
	}

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
		nodeEnv?: string;
		unifiedPagesGraph?: 'off' | 'default';
		rolldownBuildMetrics?: boolean;
	},
	run: () => Promise<T>,
): Promise<T> {
	const snapshot = snapshotBenchEnv();

	if (overrides.nodeEnv !== undefined) {
		process.env.NODE_ENV = overrides.nodeEnv;
	}

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
