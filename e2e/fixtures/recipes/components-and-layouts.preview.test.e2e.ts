import { test } from '@playwright/test';
import { expectComponentsAndLayouts } from './components-and-layouts.shared.ts';

test('under ecopages preview, plain functions style the page and declared ones run their scripts', async ({ page }) => {
	await expectComponentsAndLayouts(page);
});
