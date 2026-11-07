import { test } from '../../app-fixture.ts';
import { expectComponentsAndLayouts } from './components-and-layouts.shared.ts';

test('in development, plain functions style the page and declared ones run their scripts', async ({ page }) => {
	await expectComponentsAndLayouts(page);
});
