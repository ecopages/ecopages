import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';
import type { DevPrewarmReadiness } from './dev-static-route-prewarm.ts';

export type DevPrewarmPlan = {
	pathnames: readonly string[];
	beforeReadyPathnames: readonly string[];
	readiness: DevPrewarmReadiness;
};

/**
 * Aggregates processor-declared dev prewarm pathnames and readiness into one plan.
 */
export async function collectAppDevPrewarmPlan(appConfig: EcoPagesAppConfig): Promise<DevPrewarmPlan> {
	const pathnames = new Set(appConfig.devPrewarmPaths ?? []);
	const beforeReadyPathnames = new Set(appConfig.devPrewarmBeforeReadyPaths ?? []);
	let readiness: DevPrewarmReadiness = 'background';

	for (const processor of appConfig.processors.values()) {
		const contributor = processor as Processor;
		const plan = await contributor.collectDevPrewarmPlan();
		for (const pathname of plan.pathnames) {
			pathnames.add(pathname);
		}
		if (plan.readiness === 'beforeReady') {
			readiness = 'beforeReady';
			for (const pathname of plan.pathnames) {
				beforeReadyPathnames.add(pathname);
			}
		}
	}

	for (const pathname of beforeReadyPathnames) {
		pathnames.add(pathname);
	}

	return {
		pathnames: [...pathnames],
		beforeReadyPathnames: [...beforeReadyPathnames],
		readiness,
	};
}
