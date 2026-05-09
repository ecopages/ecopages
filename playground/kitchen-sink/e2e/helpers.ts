import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { getPrimaryLinkTestId, getRouteLinkTestId } from '../src/data/primary-links';

type CounterExpectations = {
	kita?: string | false;
	lit?: string | false;
	react?: string | false;
};

const RETRIABLE_NAVIGATION_ERROR_FRAGMENTS = [
	'net::ERR_ABORTED',
	'net::ERR_EMPTY_RESPONSE',
	'frame was detached',
	'interrupted by another navigation',
	'chrome-error://chromewebdata/',
	'Target page, context or browser has been closed',
];

const RETRIABLE_REQUEST_ERROR_FRAGMENTS = ['ECONNRESET', 'ECONNREFUSED', 'socket hang up', 'fetch failed'];

function isRetriableNavigationError(error: unknown): error is Error {
	return (
		error instanceof Error &&
		RETRIABLE_NAVIGATION_ERROR_FRAGMENTS.some((fragment) => error.message.includes(fragment))
	);
}

function isRetriableRequestError(error: unknown): error is Error {
	return (
		error instanceof Error && RETRIABLE_REQUEST_ERROR_FRAGMENTS.some((fragment) => error.message.includes(fragment))
	);
}

function isChromeErrorUrl(url: string): boolean {
	return url.startsWith('chrome-error://');
}

function getNavigationBaseUrl(page: Page): string {
	const currentUrl = page.url();

	if (currentUrl && !isChromeErrorUrl(currentUrl) && !currentUrl.startsWith('about:')) {
		try {
			return new URL(currentUrl).href;
		} catch {
			// Fall through to the neutral base URL below.
		}
	}

	return 'http://localhost/';
}

async function waitForStablePaint(page: Page) {
	await page
		.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => resolve());
					});
				}),
		)
		.catch(() => undefined);
}

async function clickLocatorAndWaitInternal(page: Page, link: Locator, href: string) {
	if (!(await link.isVisible().catch(() => false))) {
		await gotoAndWait(page, href);
		return;
	}

	const targetUrl = new URL(href, getNavigationBaseUrl(page));

	try {
		await Promise.all([
			page.waitForURL((url) => url.pathname === targetUrl.pathname && url.search === targetUrl.search, {
				timeout: 5000,
			}),
			link.click({ noWaitAfter: true }),
		]);
	} catch (error) {
		if (!isRetriableNavigationError(error) && !(error instanceof Error && error.message.includes('Timeout'))) {
			throw error;
		}

		await gotoAndWait(page, href);
		return;
	}

	try {
		await waitForPageReady(page, href);
	} catch (error) {
		if (isRetriableNavigationError(error) || (error instanceof Error && error.message.includes('Timeout'))) {
			await gotoAndWait(page, href);
			return;
		}

		throw error;
	}
}

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
			expect(combinedErrors).not.toMatch(/Invalid hook call/i);
			expect(combinedErrors).not.toMatch(/Cannot read properties of null \(reading 'useState'\)/i);
			expect(combinedErrors).not.toMatch(/Cannot read properties of undefined/i);
			expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
			expect(combinedErrors).not.toMatch(/Missing props reference/i);
			expect(combinedErrors).not.toMatch(/Failed to execute 'appendChild'/i);
			expect(combinedErrors).not.toMatch(/Hydration failed/i);
		},
	};
}

export async function requestGetAndWait(request: APIRequestContext, href: string, timeout = 10000) {
	let lastResponse: Awaited<ReturnType<typeof request.get>> | undefined;

	await expect
		.poll(
			async () => {
				try {
					lastResponse = await request.get(href);
					return lastResponse.ok() ? lastResponse.status() : 0;
				} catch (error) {
					if (!isRetriableRequestError(error)) {
						throw error;
					}

					lastResponse = undefined;
					return 0;
				}
			},
			{
				intervals: [100, 200, 350, 500],
				timeout,
			},
		)
		.toBe(200);

	expect(
		lastResponse?.ok(),
		`${href} should respond with a successful status after retrying transient request failures`,
	).toBe(true);

	return lastResponse!;
}

async function clickCounter(button: Locator) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await expect(button).toBeVisible();
			await button.scrollIntoViewIfNeeded().catch(() => undefined);
			await button.click({ noWaitAfter: true, timeout: 5000 });
			return;
		} catch (error) {
			if (attempt === 2) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}

async function waitForNextPaint(target: Locator) {
	try {
		await target.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => resolve());
					});
				}),
		);
	} catch {
		return;
	}
}

async function waitForLitCounterReady(counter: Locator) {
	await expect(counter).toHaveCount(1);
	await counter.evaluate(async (element) => {
		const litElement = element as HTMLElement & {
			updateComplete?: Promise<unknown>;
			shadowRoot: ShadowRoot | null;
		};

		await customElements.whenDefined('lit-counter');
		await litElement.updateComplete;

		if (!litElement.shadowRoot?.querySelector('[data-lit-value]')) {
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});
		}
	});
}

export async function incrementCounter(button: Locator, value: Locator, expectedValue: string) {
	await expect
		.poll(
			async () => {
				await clickCounter(button);
				await waitForNextPaint(value);
				return ((await value.textContent()) ?? '').trim();
			},
			{
				intervals: [100, 200, 350, 500],
				timeout: 5000,
			},
		)
		.toBe(expectedValue);
}

export async function assertCounterInteractivity(root: Locator, expectations: CounterExpectations = {}) {
	const kitaValue = root.locator('[data-kita-value]');
	const litCounter = root.locator('lit-counter[data-counter-kind="lit"]');
	const litValue = root.locator('[data-lit-value]').first();
	const reactValue = root.locator('[data-react-value]');

	if (expectations.kita !== false) {
		const initialKita = expectations.kita ?? '0';
		await expect(kitaValue).toHaveText(initialKita);
		await incrementCounter(root.locator('[data-kita-inc]'), kitaValue, String(Number(initialKita) + 1));
	}

	if (expectations.lit !== false) {
		const initialLit = expectations.lit ?? '0';
		await waitForLitCounterReady(litCounter);
		await expect(litValue).toHaveText(initialLit);
		await incrementCounter(root.locator('[data-lit-inc]').first(), litValue, String(Number(initialLit) + 1));
	}

	if (expectations.react !== false) {
		const initialReact = expectations.react ?? '0';
		await expect(reactValue).toHaveText(initialReact);
		await incrementCounter(root.locator('[data-react-inc]'), reactValue, String(Number(initialReact) + 1));
	}
}

export async function assertRadiantCounterInteractivity(counter: Locator, initialValue = '0') {
	const value = counter.locator('[data-radiant-value]');
	const increment = counter.locator('[data-radiant-inc]');

	await expect(counter).toBeVisible();
	await expect(value).toHaveText(initialValue);
	await incrementCounter(increment, value, String(Number(initialValue) + 1));
}

export async function assertFourCountersVisible(root: Locator) {
	const kitaCounter = root.locator('[data-kita-counter]');
	const litCounter = root.locator('lit-counter[data-counter-kind="lit"]');
	const litValue = root.locator('[data-lit-value]').first();
	const reactCounter = root.locator('[data-react-counter]');
	const radiantCounter = root.locator('radiant-counter[data-radiant-counter]');

	await expect(root).toBeVisible();
	await root.scrollIntoViewIfNeeded().catch(() => undefined);
	await waitForNextPaint(root);

	await expect(kitaCounter).toHaveCount(1);
	await waitForLitCounterReady(litCounter);
	await expect(reactCounter).toHaveCount(1);
	await expect(radiantCounter).toHaveCount(1);

	await expect(kitaCounter).toBeVisible();
	await expect(litValue).toBeVisible();
	await expect(litCounter).toBeVisible();
	await expect(reactCounter).toBeVisible();
	await expect(radiantCounter).toBeVisible();
}

export async function assertAllCountersInteractivity(
	root: Locator,
	options?: CounterExpectations & { radiant?: string },
) {
	await assertFourCountersVisible(root);
	await assertCounterInteractivity(root, options);
	await assertRadiantCounterInteractivity(root.locator('radiant-counter').first(), options?.radiant ?? '0');
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

export async function waitForPageReady(page: Page, href?: string) {
	const targetUrl = href ? new URL(href, getNavigationBaseUrl(page)) : undefined;

	if (targetUrl) {
		await expect
			.poll(
				() => {
					try {
						const currentUrl = new URL(page.url());
						return `${currentUrl.pathname}${currentUrl.search}`;
					} catch {
						return '';
					}
				},
				{ timeout: 10000 },
			)
			.toBe(`${targetUrl.pathname}${targetUrl.search}`);
	}

	await page.waitForLoadState('domcontentloaded').catch(() => undefined);
	await page.waitForLoadState('load').catch(() => undefined);
	await page
		.waitForFunction(() => document.readyState !== 'loading' && !!document.body, null, {
			timeout: 10000,
		})
		.catch(() => undefined);
	await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
	await waitForStablePaint(page);
	await expect
		.poll(
			async () => {
				try {
					return await page.title();
				} catch {
					return '';
				}
			},
			{ timeout: 10000 },
		)
		.not.toMatch(/^Loading\s/u);
}

export async function gotoAndWait(page: Page, href: string) {
	const targetUrl = new URL(href, getNavigationBaseUrl(page));

	for (let attempt = 0; attempt < 4; attempt += 1) {
		if (page.url() === targetUrl.href) {
			try {
				await waitForPageReady(page, href);
				return;
			} catch (error) {
				if (attempt === 3 || !isRetriableNavigationError(error)) {
					throw error;
				}
			}
		}

		try {
			await page.goto(href, { waitUntil: 'domcontentloaded' });
			await waitForPageReady(page, href);
			return;
		} catch (error) {
			if (attempt === 3 || !isRetriableNavigationError(error)) {
				throw error;
			}

			if (isChromeErrorUrl(page.url())) {
				await page.goto('about:blank').catch(() => undefined);
			}

			await page.waitForTimeout(150).catch(() => undefined);
		}
	}
}

/**
 * Clicks a route link when available and falls back to direct navigation if the click misses.
 */
export async function clickHrefAndWait(page: Page, href: string) {
	const routeLink = page.getByTestId(getRouteLinkTestId(href)).first();
	const primaryLink = page.getByTestId(getPrimaryLinkTestId(href)).first();
	const fallbackLink = page.locator(`a[href="${href}"]`).first();
	const link = (await primaryLink.isVisible().catch(() => false))
		? primaryLink
		: (await routeLink.isVisible().catch(() => false))
			? routeLink
			: fallbackLink;

	await clickLocatorAndWaitInternal(page, link, href);
}

export async function clickLocatorAndWait(page: Page, link: Locator, href: string) {
	await clickLocatorAndWaitInternal(page, link, href);
}

export async function readHeaderNavigation(page: Page) {
	return page.locator('header nav a').evaluateAll((links) =>
		links.map((link) => ({
			href: link.getAttribute('href') ?? '',
			label: link.textContent?.trim() ?? '',
		})),
	);
}

export async function assertSingleAppShell(page: Page) {
	await expect
		.poll(
			async () => {
				try {
					return await page.evaluate(() => ({
						footerCount: document.querySelectorAll('body > div > footer').length,
						headerCount: document.querySelectorAll('body > div > header').length,
						navCount: document.querySelectorAll('body > div > header nav').length,
						mainCount: document.querySelectorAll('body > div > main').length,
						rootCount: document.querySelectorAll('body > div').length,
					}));
				} catch {
					return null;
				}
			},
			{ timeout: 5000 },
		)
		.toEqual({
			footerCount: 1,
			headerCount: 1,
			mainCount: 1,
			navCount: 1,
			rootCount: 1,
		});
}

export async function settleOnRoute(options: {
	page: Page;
	href: string;
	content: Locator;
	navigate: () => Promise<unknown>;
	attempts?: number;
}) {
	const { page, href, content, navigate, attempts = 3 } = options;
	const targetUrl = new URL(href, page.url());
	const targetPathname = targetUrl.pathname;

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			await expect
				.poll(
					async () => {
						try {
							return await page.evaluate(() => window.location.pathname);
						} catch {
							return '';
						}
					},
					{
						timeout: 5000,
					},
				)
				.toBe(targetPathname);
			await expect
				.poll(
					async () => {
						try {
							return await content.isVisible();
						} catch {
							return false;
						}
					},
					{
						timeout: 5000,
					},
				)
				.toBe(true);
			return;
		} catch (error) {
			if (attempt === attempts - 1) {
				throw error;
			}

			await navigate();
			await waitForPageReady(page, href).catch(() => undefined);
		}
	}
}
