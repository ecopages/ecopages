import path from 'node:path';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { PageRendererResolver } from '../route-renderer/route-renderer.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph-session.ts';

/**
 * Returns whether production static export should warm Page Browser Graphs before rendering.
 *
 * @remarks
 * True only when `NODE_ENV === 'production'`. Independent of `force` and of
 * unified pages-graph env flags. Does not persist a disk manifest.
 */
export function shouldPrebuildProductionPageBrowserGraphs(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * Clears in-memory production Page Browser Graph session records.
 *
 * @remarks
 * Clears only the `'production'` policy so a failed or force export cannot
 * reuse staged graph output. Development session records are left intact.
 */
export function clearProductionPageBrowserGraphSession(appConfig: EcoPagesAppConfig): void {
	getAppPageBrowserGraphSession(appConfig).clearPolicyRecords('production');
}

/**
 * Warms production Page Browser Graphs for the supplied static route files.
 *
 * @remarks
 * Deduplicates and lexicographically sorts absolute route paths, then calls
 * each integration renderer's `prebuildProductionPageBrowserGraph` sequentially
 * (activates integration runtime, then resolves into
 * `page-browser-graph-session`). Does not persist a disk manifest.
 */
export async function prebuildProductionPageBrowserGraphs(
	routeFiles: readonly string[],
	routeRendererFactory: PageRendererResolver,
): Promise<void> {
	const uniqueRouteFiles = [...new Set(routeFiles.map((routeFile) => path.resolve(routeFile)))].sort((left, right) =>
		left.localeCompare(right),
	);

	for (const routeFile of uniqueRouteFiles) {
		const renderer = routeRendererFactory.getPageRenderer(routeFile) as IntegrationRenderer<unknown>;
		await renderer.prebuildProductionPageBrowserGraph(routeFile);
	}
}
