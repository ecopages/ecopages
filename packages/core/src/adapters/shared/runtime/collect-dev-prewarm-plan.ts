import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';

export type DevPrewarmPlan = {
	pathnames: readonly string[];
};

/**
 * Aggregates app `devPrewarmPaths` and processor-declared pathnames into one plan.
 */
export async function collectAppDevPrewarmPlan(appConfig: EcoPagesAppConfig): Promise<DevPrewarmPlan> {
	const pathnames = new Set(appConfig.devPrewarmPaths ?? []);

	for (const processor of appConfig.processors.values()) {
		const contributor = processor as Processor;
		const plan = await contributor.collectDevPrewarmPlan();
		for (const pathname of plan.pathnames) {
			pathnames.add(pathname);
		}
	}

	return {
		pathnames: [...pathnames],
	};
}
