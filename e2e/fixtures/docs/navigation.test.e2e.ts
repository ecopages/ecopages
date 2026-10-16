import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * Smoke test for the built docs site: sidebar navigation stays client-side.
 *
 * Link interception, stale-navigation races, history, persisted elements and `<html>` attribute
 * syncing are covered by the router and swapper browser tests in `packages/browser-router`.
 */
test.describe('Docs sidebar navigation', () => {
	const SIDEBAR = 'rui-sidebar#docs-sidebar';
	const ACTIVE_NAV_LINK = /rui-sidebar__menu-button--active/;
	const navLink = (href: string) => `${SIDEBAR} a[href="${href}"]`;

	test('preserves the selected theme when navigating from the home shell to the docs shell', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('theme', 'dark');
		});
		await gotoAndWait(page, '/');

		const toggle = page.locator('#toggle-dark-mode');
		await expect(toggle).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		const backgroundBeforeNavigation = await page.evaluate(
			() => getComputedStyle(document.documentElement).backgroundColor,
		);
		await toggle.evaluate((element) => {
			(window as Window & { initialThemeToggle?: Element }).initialThemeToggle = element;
		});
		await page.evaluate(() => {
			const samples: Array<{
				theme: string | null;
				darkClass: boolean;
				backgrounds: Record<string, string>;
			}> = [];
			const sample = () => {
				const selectors = ['html', 'body', '.docs-layout', '.docs-layout__content', 'main'];
				const backgrounds = Object.fromEntries(
					selectors.flatMap((selector) => {
						const element = document.querySelector(selector);
						return element ? [[selector, getComputedStyle(element).backgroundColor]] : [];
					}),
				);
				samples.push({
					theme: document.documentElement.getAttribute('data-theme'),
					darkClass: document.documentElement.classList.contains('dark'),
					backgrounds,
				});
			};
			const observer = new MutationObserver(sample);
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
			let animationFrame = 0;
			const sampleFrame = () => {
				sample();
				animationFrame = requestAnimationFrame(sampleFrame);
			};
			sampleFrame();
			(window as Window & { themeNavigationTrace?: { stop: () => typeof samples } }).themeNavigationTrace = {
				stop: () => {
					cancelAnimationFrame(animationFrame);
					observer.disconnect();
					sample();
					return samples;
				},
			};
		});

		await page.click('a[href="/docs/getting-started/introduction"]');
		await page.waitForURL('**/docs/getting-started/introduction');
		await waitForPageReady(page, '/docs/getting-started/introduction');
		await expect(page.getByRole('heading', { name: 'Welcome to Ecopages', exact: true })).toBeVisible();
		await page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);

		const sameToggle = await page.evaluate(() => {
			const initialToggle = (window as Window & { initialThemeToggle?: Element }).initialThemeToggle;
			return initialToggle === document.querySelector('#toggle-dark-mode');
		});
		expect(sameToggle).toBe(true);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.locator('#toggle-dark-mode')).toHaveAttribute('value', 'dark');
		const backgroundAfterNavigation = await page.evaluate(
			() => getComputedStyle(document.documentElement).backgroundColor,
		);
		expect(backgroundAfterNavigation).toBe(backgroundBeforeNavigation);
		const themeSamples = await page.evaluate(() => {
			type ThemeSample = {
				theme: string | null;
				darkClass: boolean;
				backgrounds: Record<string, string>;
			};
			const trace = (window as Window & { themeNavigationTrace?: { stop: () => ThemeSample[] } })
				.themeNavigationTrace;
			return trace?.stop() ?? [];
		});
		expect(themeSamples.length).toBeGreaterThan(1);
		expect(themeSamples.every((sample) => sample.theme === 'dark' && sample.darkClass)).toBe(true);
		expect(
			themeSamples.every(
				(sample) =>
					sample.backgrounds.html === backgroundBeforeNavigation &&
					sample.backgrounds.body === themeSamples[0]?.backgrounds.body,
			),
		).toBe(true);
	});

	test('navigates without a document request and keeps the sidebar and theme', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('theme', 'dark');
		});
		await gotoAndWait(page, '/docs/getting-started/introduction');

		const sidebar = page.locator(SIDEBAR);
		await expect(sidebar).toBeVisible();
		await expect(page.locator(navLink('/docs/getting-started/introduction'))).toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await sidebar.evaluate((el) => {
			(el as HTMLElement & { docsMarker?: string }).docsMarker = 'kept';
		});

		const documentRequests: string[] = [];
		page.on('request', (request) => {
			if (request.resourceType() === 'document') documentRequests.push(request.url());
		});

		await page.click(navLink('/docs/getting-started/configuration'));
		await page.waitForURL('**/docs/getting-started/configuration');
		await waitForPageReady(page, '/docs/getting-started/configuration');

		await expect(page.locator(navLink('/docs/getting-started/configuration'))).toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator(navLink('/docs/getting-started/introduction'))).not.toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		expect(documentRequests).toEqual([]);
		const markerAfter = await sidebar.evaluate((el) => (el as HTMLElement & { docsMarker?: string }).docsMarker);
		expect(markerAfter).toBe('kept');
	});
});
