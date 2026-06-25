import { expect } from '@playwright/test';
import type { APIRequestContext, ConsoleMessage, Page } from 'playwright-core';

const NAVIGATION_TIMEOUT = 45_000;
const HMR_CLIENT_CONNECT_TIMEOUT_MS = 60_000;
const RETRIABLE_REQUEST_ERROR_FRAGMENTS = ['ECONNRESET', 'ECONNREFUSED', 'socket hang up', 'fetch failed'];
const RETRIABLE_NAVIGATION_ERROR_FRAGMENTS = [
	'net::ERR_ABORTED',
	'net::ERR_CONNECTION_RESET',
	'net::ERR_NETWORK_IO_SUSPENDED',
	'frame was detached',
];

function isRetriableRequestError(error: unknown): error is Error {
	return (
		error instanceof Error && RETRIABLE_REQUEST_ERROR_FRAGMENTS.some((fragment) => error.message.includes(fragment))
	);
}

function isRetriableNavigationError(error: unknown): error is Error {
	return (
		error instanceof Error &&
		(RETRIABLE_NAVIGATION_ERROR_FRAGMENTS.some((fragment) => error.message.includes(fragment)) ||
			(error.message.includes('Timeout') && error.message.includes('page.goto')))
	);
}

type EcoNavigationWindow = Window & {
	__ECO_PAGES__?: {
		navigation?: {
			hasPendingNavigationTransaction?: () => boolean;
			cancelCurrentNavigationTransaction?: () => void;
		};
	};
};

const RUNTIME_ERROR_PATTERNS = [
	/is not defined/i,
	/Invalid hook call/i,
	/Cannot read properties of null \(reading 'useState'\)/i,
	/Cannot read properties of undefined/i,
	/Cannot set properties of null/i,
	/Missing props reference/i,
	/Failed to execute 'appendChild'/i,
	/Hydration failed/i,
] as const;

/** Cancel an in-flight browser-router / react-router morph so Playwright can navigate again. */
export async function cancelPendingNavigation(page: Page) {
	try {
		await page.evaluate(() => {
			const navigation = (window as EcoNavigationWindow).__ECO_PAGES__?.navigation;
			navigation?.cancelCurrentNavigationTransaction?.();
		});
	} catch {
		// Ignore teardown races.
	}
}

/** Wait until browser-router / react-router morph transactions finish. */
export async function waitForNavigationIdle(page: Page, timeout = 5_000) {
	const settled = await page
		.waitForFunction(
			() => {
				const navigation = (window as EcoNavigationWindow).__ECO_PAGES__?.navigation;
				return navigation?.hasPendingNavigationTransaction?.() !== true;
			},
			null,
			{ timeout },
		)
		.then(() => true)
		.catch(() => false);

	if (!settled) {
		await cancelPendingNavigation(page);
	}
}

function normalizePath(href: string): string {
	return href.startsWith('/') ? href : `/${href}`;
}

/** Document navigation for kitchen-sink e2e hosts. */
export async function gotoPath(page: Page, href: string) {
	const targetPath = normalizePath(href);

	for (let attempt = 0; attempt < 3; attempt += 1) {
		await cancelPendingNavigation(page);
		await waitForNavigationIdle(page, 2_000);

		try {
			await page.goto(targetPath, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT });
			await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
			await waitForNavigationIdle(page, 5_000);
			return;
		} catch (error) {
			if (!isRetriableNavigationError(error) || attempt === 2) {
				throw error;
			}

			await page.waitForTimeout(150 * (attempt + 1));
		}
	}
}

/** Recover document state after rapid in-app hops before content assertions. */
export async function recoverToPath(page: Page, href: string) {
	await gotoPath(page, href);
}

/** DOM click that bypasses Playwright's navigation-gate actionability checks. */
export async function clickByTestId(page: Page, testId: string) {
	await waitForNavigationIdle(page, 5_000);
	await page.evaluate((id: string) => {
		const target = document.querySelector(`[data-testid="${id}"]`);
		if (target instanceof HTMLElement) {
			target.click();
		}
	}, testId);
}

/**
 * Captures page and console errors so E2E specs can assert that rapid navigation stays clean.
 */
export function trackRuntimeErrors(page: Page) {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];

	page.on('pageerror', (error: Error) => {
		pageErrors.push(error.message);
	});

	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});

	return {
		pageErrors,
		consoleErrors,
		assertClean() {
			const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
			for (const pattern of RUNTIME_ERROR_PATTERNS) {
				expect(pattern.test(combinedErrors), `runtime errors should not match ${pattern}`).toBe(false);
			}
		},
	};
}

export async function requestGetAndWait(request: APIRequestContext, href: string, timeout = 30000) {
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

function isViteConnectedMessage(text: string): boolean {
	return text.includes('[vite] connected');
}

/** Wait until Vite's browser HMR client has finished its websocket handshake. */
export async function waitForViteClientConnection(page: Page, timeout = HMR_CLIENT_CONNECT_TIMEOUT_MS) {
	const viteConsoleMessages: string[] = [];
	const recordViteConsole = (message: ConsoleMessage) => {
		const text = message.text();
		if (text.includes('[vite]')) {
			viteConsoleMessages.push(text);
		}
	};

	page.on('console', recordViteConsole);

	try {
		await page.waitForFunction(() => document.querySelector('script[src*="/@vite/client"]') !== null, null, {
			timeout,
		});

		await expect
			.poll(() => viteConsoleMessages.some(isViteConnectedMessage), {
				timeout,
				intervals: [50, 100, 200, 500],
			})
			.toBe(true);
	} finally {
		page.off('console', recordViteConsole);
	}
}

/** Wait until the native ecopages dev host reports its HMR bridge is live. */
export async function waitForEcopagesHmrConnection(page: Page, timeout = HMR_CLIENT_CONNECT_TIMEOUT_MS) {
	const hmrMessages: string[] = [];
	const recordHmrConsole = (message: ConsoleMessage) => {
		if (message.type() === 'log' && message.text() === '[ecopages] HMR Connected') {
			hmrMessages.push(message.text());
		}
	};

	page.on('console', recordHmrConsole);

	try {
		await expect
			.poll(() => hmrMessages.length > 0, {
				timeout,
				intervals: [50, 100, 200, 500],
			})
			.toBe(true);
	} finally {
		page.off('console', recordHmrConsole);
	}
}
