import path from 'node:path';
import { expect, test } from '../../app-fixture.ts';
import { findAbsolutePathsInBuildOutput } from '../../utils/moved-build.ts';
import { registerReactAppTests } from './react-production-start.e2e-shared';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

test.describe.configure({ mode: 'serial' });

test.describe('A React build moved to another folder under `ecopages start`', () => {
	registerReactAppTests(test, { rendersRequests: true });

	test('links the package stylesheet a plain component imports on a dynamic Page', async ({ page }) => {
		await page.goto('/dynamic');

		await expect(page.locator('.package-css-lib-badge')).toHaveCSS('outline-width', '3px');
	});

	test('writes no absolute path of the build machine into its output', ({ app }) => {
		expect(findAbsolutePathsInBuildOutput(app.dir, [app.builtDir!, repoRoot])).toEqual([]);
	});
});
