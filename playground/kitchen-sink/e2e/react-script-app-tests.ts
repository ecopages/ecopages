import { expect, test } from '@playwright/test';
import { incrementCounter } from './counters';
import { gotoPath, trackRuntimeErrors } from './test-support';

/**
 * Registers the check for the Ecopages JSX Page whose `.script.tsx` mounts a React counter with `createRoot`,
 * with no React Page or island around it.
 */
export function registerReactScriptAppTests() {
	test('mounts a React app from a client script on an Ecopages JSX Page @content', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/react-script-app');

		const root = page.getByTestId('react-script-app');
		await expect(root.locator('[data-react-value]')).toHaveText('0');

		await incrementCounter(root.locator('[data-react-inc]'), root.locator('[data-react-value]'), '1');

		runtime.assertClean();
	});
}
