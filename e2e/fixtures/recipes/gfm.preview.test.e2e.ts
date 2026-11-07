import { test } from '@playwright/test';
import { expectGfmAndHighlighting } from './gfm.shared.ts';

test('under ecopages preview, the page renders GFM and highlighted code', async ({ page }) => {
	await expectGfmAndHighlighting(page);
});
