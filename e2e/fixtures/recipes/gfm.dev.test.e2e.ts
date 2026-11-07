import { test } from '../../app-fixture.ts';
import { expectGfmAndHighlighting } from './gfm.shared.ts';

test('in development, the page renders GFM and highlighted code', async ({ page }) => {
	await expectGfmAndHighlighting(page);
});
