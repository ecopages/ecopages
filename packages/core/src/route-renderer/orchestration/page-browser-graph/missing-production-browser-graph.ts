import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { PageParams } from '../../../types/contracts.ts';
import { isProductionRuntime } from '../../../utils/runtime.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import { describePageDependencyInstance, describePageDependencyInstanceKey } from './route-instance-key.ts';

/**
 * Formats the `entry …` label for {@link missingProductionBrowserGraphError}.
 *
 * @remarks
 * Prefers Params when present. Otherwise formats the instance key next to its serializer.
 */
export function describeProductionBrowserGraphEntry(params?: PageParams, dependencyInstanceKey?: string): string {
	if (params && Object.keys(params).length > 0) {
		return describePageDependencyInstance({ params });
	}
	return describePageDependencyInstanceKey(dependencyInstanceKey ?? '');
}

/**
 * Returns whether production serving must reject a Page Browser Graph that was not built.
 *
 * @remarks
 * True only after `ecopages start`, or the Lit static-render worker, restores the production asset ledger.
 * Static export itself still builds a graph while writing HTML.
 */
export function shouldRejectUnplannedProductionBrowserGraph(appConfig: EcoPagesAppConfig): boolean {
	return isProductionRuntime() && requireAppRuntime(appConfig).productionBrowserGraphsSealed;
}

/**
 * Error for a production request whose Page Browser Graph scripts `ecopages build` did not build.
 */
export function missingProductionBrowserGraphError(routeFile: string, entry: string): Error {
	return new Error(
		`The production Page Browser Graph for ${routeFile} is missing from the production asset ledger (entry ${entry}). Run \`ecopages build\` again.`,
	);
}
