/**
 * Process-wide Rolldown build invocation counters for benchmarks and spikes.
 *
 * Gated behind {@link isRolldownBuildMetricsEnabled} so production paths stay quiet.
 */

const invocationCounts = new Map<string, number>();
let pageModuleBuildInvocations = 0;

export function isRolldownBuildMetricsEnabled(): boolean {
	return process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS === '1' || process.env.ECOPAGES_LOGGER_DEBUG === 'true';
}

export function recordRolldownBuildInvocation(adapter: 'rolldown' = 'rolldown'): void {
	if (!isRolldownBuildMetricsEnabled()) {
		return;
	}

	invocationCounts.set(adapter, (invocationCounts.get(adapter) ?? 0) + 1);
}

export function getRolldownBuildInvocationCounts(): Readonly<Record<string, number>> {
	return Object.fromEntries(invocationCounts);
}

export function resetRolldownBuildInvocationCounts(): void {
	invocationCounts.clear();
	pageModuleBuildInvocations = 0;
}

export function recordPageModuleBuildInvocation(): void {
	if (!isRolldownBuildMetricsEnabled()) {
		return;
	}

	pageModuleBuildInvocations += 1;
}

export function getPageModuleRolldownBuildInvocations(): number {
	return pageModuleBuildInvocations;
}

export function getTotalRolldownBuildInvocations(): number {
	let total = 0;
	for (const count of invocationCounts.values()) {
		total += count;
	}
	return total;
}
