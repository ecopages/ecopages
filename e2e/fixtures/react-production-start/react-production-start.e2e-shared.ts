import { expect, type Page, type TestType } from '@playwright/test';
import { trackReactModules, type ReactModuleResponse } from '../../utils/react-modules';

/**
 * Pages of the fixture, each with a counter that hydrates, whether a React island renders it, and whether the
 * static export holds it; the others are a dynamic Page and explicit routes, which only a server renders.
 */
const hydratedPages = [
	{ pathname: '/', island: true, exported: true },
	{ pathname: '/dynamic', island: true, exported: false },
	{ pathname: '/kita-view', island: true, exported: false },
	{ pathname: '/react-page', island: false, exported: true },
	{ pathname: '/react-view', island: false, exported: false },
] as const;

type ReactAppTestOptions = {
	/** Whether the server renders requests, so dynamic Pages and explicit routes exist; a static preview does not. */
	rendersRequests: boolean;
	/** Receives the one file that holds React on each page, for a mode to check how it is served. */
	checkReactModule?: (module: ReactModuleResponse) => void;
};

/**
 * Registers the specs that run against `ecopages dev`, `ecopages preview` and `ecopages start`.
 *
 * @remarks
 * The React plugin has the router, so React Pages hydrate through it while the Kita Pages hydrate a React island.
 */
export function registerReactAppTests<T extends { page: Page }, W extends object>(
	test: TestType<T, W>,
	{ rendersRequests, checkReactModule = () => {} }: ReactAppTestOptions,
) {
	for (const { pathname, island } of hydratedPages.filter((page) => rendersRequests || page.exported)) {
		test(`serves ${pathname}, hydrates its counter and loads React from one module`, async ({ page }) => {
			const readReactModules = trackReactModules(page);
			const response = await page.goto(pathname);

			expect(response?.status()).toBe(200);
			const counter = page.locator('[data-counter]');
			await expect(counter).toHaveText('count 0');
			if (island) await expect(page.locator('eco-island[data-eco-hydrated]')).toHaveCount(1);
			await counter.click();
			await expect(counter).toHaveText('count 1');
			const reactModules = await readReactModules();
			expect(reactModules).toHaveLength(1);
			checkReactModule(reactModules[0]!);
		});
	}

	test('keeps the router layout state across client navigation and loads React once', async ({ page }) => {
		const readReactModules = trackReactModules(page);
		await page.goto('/router/first');
		await expect(page.locator('h1')).toHaveText('router-first');
		const layoutCounter = page.locator('[data-layout-counter]');
		await expect
			.poll(async () => {
				await layoutCounter.click();
				return layoutCounter.textContent();
			})
			.not.toBe('layout 0');
		const count = await layoutCounter.textContent();

		await page.locator('[data-link-second]').click();
		await page.waitForURL('**/router/second');
		await expect(page.locator('h1')).toHaveText('router-second');
		await expect(layoutCounter).toHaveText(count!);
		expect(await readReactModules()).toHaveLength(1);
	});
}
