import { expect, test } from '@playwright/test';
import { trackRuntimeErrors } from './test-support';

export function registerDependencyDiscoveryTests() {
test.describe('Dependency discovery @parity', () => {
	for (const route of ['/discovery', '/discovery-explicit', '/discovery-foreign']) {
		test(`preserves SSR and lazy registration on ${route}`, async ({ page, request }) => {
			const response = await request.get(route);
			expect(response.ok()).toBe(true);
			const markup = await response.text();
			expect(markup).toContain('shadowrootmode="open"');
			expect(markup).toContain('data-discovery-value');
			const runtime = trackRuntimeErrors(page);
			const requestedScripts: string[] = [];
			page.on('request', (request) => { if (request.resourceType() === 'script') requestedScripts.push(request.url()); });
			await page.goto(route);
			const host = page.locator('discovery-counter');
			await expect(host.locator('[data-discovery-value]')).toHaveText('7');
			expect(await page.evaluate(() => Boolean(customElements.get('discovery-counter')))).toBe(false);
			await expect(page.locator('.discovery-counter-host')).toHaveCSS('border-top-width', '7px');
			const lazyScripts = await page.evaluate(() => {
				const trigger = document.querySelector('.discovery-counter-host')?.getAttribute('data-eco-trigger');
				const maps = [...document.querySelectorAll('script[type="ecopages/global-injector-map"]')];
				const merged = Object.assign({}, ...maps.map((map) => JSON.parse(map.textContent ?? '{}')));
				return (merged[trigger ?? '']?.['on:visible']?.scripts ?? []) as string[];
			});
			expect(lazyScripts).toHaveLength(1);
			const scriptUrl = new URL(lazyScripts[0], page.url()).href;
			expect(requestedScripts.filter((url) => url === scriptUrl)).toHaveLength(0);
			const stylesheetUrls = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
			const stylesheetContents = await Promise.all(stylesheetUrls.map(async (url) => (await request.get(url)).text()));
			expect(stylesheetContents.join('\n').match(/\.discovery-counter-host\s*\{/g)).toHaveLength(1);
			await host.scrollIntoViewIfNeeded();
			await expect.poll(() => page.evaluate(() => Boolean(customElements.get('discovery-counter')))).toBe(true);
			await host.locator('[data-discovery-increment]').click();
			await expect(host.locator('[data-discovery-value]')).toHaveText('8');
			expect(requestedScripts.filter((url) => url === scriptUrl)).toHaveLength(1);
			runtime.assertClean();
		});
	}
});

test('discovers React component CSS without additional hydration @parity', async ({ page }) => {
	const runtime = trackRuntimeErrors(page);
	await page.goto('/discovery-react');
	const card = page.getByRole('button', { name: 'Count 0' });
	await expect(card).toHaveCSS('border-top-width', '9px');
	await card.click();
	await expect(page.getByRole('button', { name: 'Count 1' })).toBeVisible();
	runtime.assertClean();
});

}
