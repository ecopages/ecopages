/**
 * Process-wide Rolldown build invocation counters for benchmarks and spikes.
 *
 * Gated behind {@link isRolldownBuildMetricsEnabled} so production paths stay quiet.
 */

import { isEcopagesEnvEnabled } from '../../env.ts';

let buildInvocations = 0;
let pageModuleBuildInvocations = 0;

export function isRolldownBuildMetricsEnabled(): boolean {
	return isEcopagesEnvEnabled('ECOPAGES_ROLLDOWN_BUILD_METRICS') || isEcopagesEnvEnabled('ECOPAGES_LOGGER_DEBUG');
}

export function recordRolldownBuildInvocation(): void {
	if (!isRolldownBuildMetricsEnabled()) {
		return;
	}

	buildInvocations += 1;
}

export function resetRolldownBuildInvocationCounts(): void {
	buildInvocations = 0;
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
	return buildInvocations;
}
