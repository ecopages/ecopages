import { expect, type Page } from '@playwright/test';

/** Asserts the GFM recipe: the GitHub-flavoured elements and the build-time highlighted code in both color schemes. */
export async function expectGfmAndHighlighting(page: Page): Promise<void> {
	await page.goto('/');

	await expect(page.locator('table th')).toHaveText(['Feature', 'Syntax']);
	await expect(page.locator('del')).toHaveText('Removed text');
	await expect(page.locator('a[href="https://www.ecopages.app"]')).toBeVisible();
	await expect(page.locator('input[type="checkbox"]')).toHaveCount(2);
	await expect(page.locator('[data-footnotes] li')).toHaveCount(1);

	const keyword = page.locator('pre[data-language="ts"] span[data-line] > span').first();
	await expect(keyword).toHaveText('const');
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(keyword).toHaveCSS('color', 'rgb(0, 0, 255)');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(keyword).toHaveCSS('color', 'rgb(86, 156, 214)');
}
