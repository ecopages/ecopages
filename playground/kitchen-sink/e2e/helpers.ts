import { expect, type Locator, type Page } from '@playwright/test';
import { getPrimaryLinkTestId, getRouteLinkTestId } from '../src/data/primary-links';

type CounterExpectations = {
	kita?: string;
	lit?: string;
	react?: string;
};

/**
 * Captures page and console errors so E2E specs can assert that rapid navigation stays clean.
 */
export function trackRuntimeErrors(page: Page) {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];

	page.on('pageerror', (error) => {
		pageErrors.push(error.message);
	});

	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});

	return {
		pageErrors,
		consoleErrors,
		assertClean() {
			const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
			expect(combinedErrors).not.toMatch(/is not defined/i);
			expect(combinedErrors).not.toMatch(/Cannot read properties of undefined/i);
			expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
			expect(combinedErrors).not.toMatch(/Missing props reference/i);
			expect(combinedErrors).not.toMatch(/Failed to execute 'appendChild'/i);
			expect(combinedErrors).not.toMatch(/Hydration failed/i);
		},
	};
}

async function clickCounter(button: Locator) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await expect(button).toBeVisible();
			await button.click({ timeout: 5000 });
			return;
		} catch (error) {
			if (attempt === 2) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}

export async function incrementCounter(button: Locator, value: Locator, expectedValue: string) {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		try {
			await clickCounter(button);
			await expect(value).toHaveText(expectedValue, { timeout: 1000 });
			return;
		} catch (error) {
			if (attempt === 3) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 150));
		}
	}
}

export async function assertCounterInteractivity(root: Locator, expectations: CounterExpectations = {}) {
	const initialKita = expectations.kita ?? '0';
	const initialLit = expectations.lit ?? '0';
	const initialReact = expectations.react ?? '0';
	const kitaValue = root.locator('[data-kita-value]');
	const litValue = root.locator('[data-lit-value]').first();
	const reactValue = root.locator('[data-react-value]');

	await expect(kitaValue).toHaveText(initialKita);
	await incrementCounter(root.locator('[data-kita-inc]'), kitaValue, String(Number(initialKita) + 1));

	await expect(litValue).toHaveText(initialLit);
	await incrementCounter(root.locator('[data-lit-inc]').first(), litValue, String(Number(initialLit) + 1));

	await expect(reactValue).toHaveText(initialReact);
	await incrementCounter(root.locator('[data-react-inc]'), reactValue, String(Number(initialReact) + 1));
}

export function getSectionByHeading(page: Page, heading: string): Locator {
	return page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
		.first();
}

export function getSectionByText(page: Page, text: string): Locator {
	return page.locator('section').filter({ hasText: text }).first();
}

export async function gotoAndWait(page: Page, href: string) {
	try {
		await page.goto(href);
	} catch (error) {
		if (
			!(error instanceof Error) ||
			(!error.message.includes('net::ERR_ABORTED') && !error.message.includes('frame was detached'))
		) {
			throw error;
		}

		await page.goto(href, { waitUntil: 'domcontentloaded' });
	}

	await page.waitForLoadState('networkidle');
}

/**
 * Clicks a route link when available and falls back to direct navigation if the click misses.
 */
export async function clickHrefAndWait(page: Page, href: string) {
	const routeLink = page.getByTestId(getRouteLinkTestId(href)).first();
	const primaryLink = page.getByTestId(getPrimaryLinkTestId(href)).first();
	const link = (await primaryLink.isVisible().catch(() => false)) ? primaryLink : routeLink;
	await expect(link).toBeVisible();
	const targetUrl = new URL(href, page.url());

	try {
		await Promise.all([
			page.waitForURL((url) => url.pathname === targetUrl.pathname && url.search === targetUrl.search, {
				timeout: 5000,
			}),
			link.click(),
		]);
	} catch {
		await gotoAndWait(page, href);
		return;
	}

	await page.waitForLoadState('networkidle').catch(() => undefined);
}

export async function expectNavigationOwner(page: Page, owner: string) {
	await expect
		.poll(async () =>
			page.evaluate(() => {
				return window.__ecopages_navigation__?.getOwnerState?.().owner ?? 'none';
			}),
		)
		.toBe(owner);
}

/**
 * Fetches the current page module source referenced by the client runtime.
 */
export async function fetchCurrentPageModule(page: Page) {
	const pageModuleUrl = await page.evaluate(() => window.__ECO_PAGE__?.module ?? null);

	if (!pageModuleUrl) {
		throw new Error('Expected React page module URL to be available on window.__ECO_PAGE__.module');
	}

	const source = await page.evaluate(async (moduleUrl) => {
		const response = await fetch(moduleUrl);
		return response.text();
	}, pageModuleUrl);

	return {
		url: pageModuleUrl,
		source,
	};
}

/**
 * Extracts static and dynamic module specifiers from an ESM source string.
 */
export function collectModuleSpecifiers(source: string) {
	const specifiers = new Set<string>();
	const staticPattern =
		/(?:^|[;\n\r])\s*(?:import\s+(?:type\s+)?(?:[^'"`;]+?\s+from\s+)?|export\s+(?:type\s+)?[^'"`;]+?\s+from\s+)(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1/gm;
	const dynamicPattern = /import\s*\(\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\s*\)/gm;

	for (const match of source.matchAll(staticPattern)) {
		specifiers.add(match[2]);
	}

	for (const match of source.matchAll(dynamicPattern)) {
		specifiers.add(match[2]);
	}

	return Array.from(specifiers).sort((left, right) => left.localeCompare(right));
}

export async function readHeaderNavigation(page: Page) {
	return page.locator('header nav a').evaluateAll((links) =>
		links.map((link) => ({
			href: link.getAttribute('href') ?? '',
			label: link.textContent?.trim() ?? '',
		})),
	);
}
