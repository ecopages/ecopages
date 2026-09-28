import { registerDependencyDiscoveryTests } from './dependency-discovery-tests';
import { expect, test } from '@playwright/test';
import { parityRoutes } from '../src/data/parity-routes';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPathSimple, trackRuntimeErrors } from './test-support';

/**
 * Cross-runtime/host parity: plain sequential document navigation must render
 * the same on every supported cell (ecopages+node, ecopages+bun, vite+node,
 * vite+bun). This single `@parity` spec is the only test each non-canonical
 * cell runs; full behavioral depth stays on the canonical dev project.
 */
test.describe('Cross-integration parity @parity', () => {
	test('completes sequential document navigations across shell routes', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		for (const route of parityRoutes) {
			await gotoPathSimple(page, route);
			await expect(page.getByTestId(getPageTestId(route))).toBeVisible();
		}

		runtime.assertClean();
	});
});

registerDependencyDiscoveryTests();
