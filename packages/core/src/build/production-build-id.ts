import { randomUUID } from 'node:crypto';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';

/**
 * Returns the build id for this production export, creating one if needed.
 *
 * @remarks
 * Every production manifest written during one `ecopages build` shares this
 * id so `ecopages start` can refuse a mixed `dist/`.
 */
export function ensureProductionBuildId(appConfig: EcoPagesAppConfig): string {
	const runtime = appConfig.appRuntime;
	if (runtime?.productionBuildId) {
		return runtime.productionBuildId;
	}
	const buildId = randomUUID();
	if (runtime) {
		runtime.productionBuildId = buildId;
	}
	return buildId;
}
