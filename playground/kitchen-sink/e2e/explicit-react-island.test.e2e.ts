import { expect, test } from '../../../e2e/app-fixture';
import { incrementCounter } from './counters';
import { gotoPath, trackRuntimeErrors } from './test-support';

test('hydrates a React island in a Kita explicit view @content', async ({ page }) => {
	const runtime = trackRuntimeErrors(page);

	await gotoPath(page, '/explicit/react-island');

	const root = page.getByTestId('page-explicit-react-island');
	await expect(root).toBeVisible();
	await expect(root.locator('[data-eco-island]')).toBeAttached();
	await expect(root.locator('[data-react-value]')).toHaveText('0');

	await incrementCounter(root.locator('[data-react-inc]'), root.locator('[data-react-value]'), '1');

	runtime.assertClean();
});
