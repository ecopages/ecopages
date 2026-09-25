import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';

export type DevPrewarmPlan = {
	pathnames: readonly string[];
	beforeReadyPathnames: readonly string[];
};

/**
 * Aggregates processor-declared dev prewarm pathnames into one plan.
 */
export async function collectAppDevPrewarmPlan(appConfig: EcoPagesAppConfig): Promise<DevPrewarmPlan> {
	const pathnames = new Set(appConfig.devPrewarmPaths ?? []);
	const beforeReadyPathnames = new Set(appConfig.devPrewarmBeforeReadyPaths ?? []);

	for (const processor of appConfig.processors.values()) {
		const contributor = processor as Processor;
		const plan = await contributor.collectDevPrewarmPlan();
		for (const pathname of plan.pathnames) {
			pathnames.add(pathname);
		}
		if (plan.readiness === 'beforeReady') {
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
	};
}
