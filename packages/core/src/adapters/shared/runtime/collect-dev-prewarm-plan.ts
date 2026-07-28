import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';
import type { DevPrewarmReadiness } from './dev-static-route-prewarm.ts';

export type DevPrewarmPlan = {
	pathnames: readonly string[];
	readiness: DevPrewarmReadiness;
};

/**
 * Aggregates processor-declared dev prewarm pathnames and readiness into one plan.
 */
export async function collectAppDevPrewarmPlan(appConfig: EcoPagesAppConfig): Promise<DevPrewarmPlan> {
	const pathnames = new Set<string>();
	let readiness: DevPrewarmReadiness = 'background';

	for (const processor of appConfig.processors.values()) {
		const contributor = processor as Processor;
		const plan = await contributor.collectDevPrewarmPlan();
		for (const pathname of plan.pathnames) {
			pathnames.add(pathname);
		}
		if (plan.readiness === 'beforeReady') {
			readiness = 'beforeReady';
		}
	}

	return {
		pathnames: [...pathnames],
		readiness,
	};
}
