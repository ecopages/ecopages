import { expect, type Page } from '@playwright/test';

/** Asserts the components and layouts recipe: what a plain function and a plain layout get, and what `eco.component()` and `eco.layout()` add. */
export async function expectComponentsAndLayouts(page: Page): Promise<void> {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto('/');
	await expect(page.locator('[data-layout="plain"] header')).toHaveText('Plain layout');
	await expect(page.locator('.badge')).toHaveCSS('border-top-left-radius', '999px');
	const counter = page.locator('[data-counter]');
	await counter.click();
	await expect(counter).toHaveText('1');

	await page.goto('/scripted');
	await expect(page.locator('[data-layout="scripted"]')).toHaveAttribute('data-ready', 'true');
	expect(errors).toEqual([]);
}
