import { expect } from '@playwright/test';
import type { APIRequestContext, ConsoleMessage, Page } from 'playwright-core';

const NAVIGATION_TIMEOUT = 45_000;
const HMR_CLIENT_CONNECT_TIMEOUT_MS = 60_000;
const RETRIABLE_REQUEST_ERROR_FRAGMENTS = ['ECONNRESET', 'ECONNREFUSED', 'socket hang up', 'fetch failed'];

function isRetriableRequestError(error: unknown): error is Error {
	return (
		error instanceof Error && RETRIABLE_REQUEST_ERROR_FRAGMENTS.some((fragment) => error.message.includes(fragment))
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

	await cancelPendingNavigation(page);
	await waitForNavigationIdle(page, 2_000);
	await page.goto(targetPath, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT });
	await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
	await waitForNavigationIdle(page, 5_000);
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

/** Begin waiting for the ecopages HMR websocket before the page navigates. */
export function startEcopagesHmrConnectionWatch(page: Page, timeout = HMR_CLIENT_CONNECT_TIMEOUT_MS) {
	const socketReady = page
		.waitForEvent('websocket', {
			predicate: (ws) => ws.url().endsWith('/_hmr'),
			timeout,
		})
		.then(() => true)
		.catch(() => false);

	const hmrMessages: string[] = [];
	const recordHmrConsole = (message: ConsoleMessage) => {
		if (message.type() === 'log' && message.text() === '[ecopages] HMR Connected') {
			hmrMessages.push(message.text());
		}
	};

	page.on('console', recordHmrConsole);

	return (async () => {
		try {
			const consoleReady = expect
				.poll(() => hmrMessages.length > 0, {
					timeout,
					intervals: [50, 100, 200, 500],
				})
				.toBe(true)
				.then(() => true)
				.catch(() => false);

			const connected = await Promise.race([socketReady, consoleReady]);
			expect(connected, 'expected ecopages HMR websocket or runtime handshake').toBe(true);
		} finally {
			page.off('console', recordHmrConsole);
		}
	})();
}

/** Wait until the native ecopages dev host reports its HMR bridge is live. */
export async function waitForEcopagesHmrConnection(page: Page, timeout = HMR_CLIENT_CONNECT_TIMEOUT_MS) {
	await startEcopagesHmrConnectionWatch(page, timeout);
}

const HMR_TIMING_ENABLED = process.env.ECOPAGES_E2E_HMR_TIMING === 'true';

/** Optional phase logger for HMR E2E investigations. */
export function createHmrPhaseTimer(testName: string) {
	const startedAt = Date.now();
	const marks = new Map<string, number>();

	return {
		mark(phase: string) {
			if (!HMR_TIMING_ENABLED) {
				return;
			}

			const now = Date.now();
			marks.set(phase, now);
			const sinceStart = now - startedAt;
			const previousPhase = [...marks.keys()].at(-2);
			const sincePrevious =
				previousPhase && marks.has(previousPhase) ? now - (marks.get(previousPhase) ?? now) : sinceStart;

			console.log(
				`[e2e-hmr-timing] ${testName} :: ${phase} +${sincePrevious}ms (total ${sinceStart}ms)`,
			);
		},
	};
}

/** Installs a reload detector before navigation so it survives document replacements. */
export async function installFullDocumentReloadWatcher(page: Page, timeout = 10_000) {
	await page.addInitScript((timeoutMs) => {
		const state = { detected: false, done: false };
		(window as EcoNavigationWindow & { __ecopagesReloadWatch?: typeof state }).__ecopagesReloadWatch = state;
		const initialNavigationCount = performance.getEntriesByType('navigation').length;
		const startedAt = performance.now();

		const poll = () => {
			const entries = performance.getEntriesByType('navigation');
			if (entries.slice(initialNavigationCount).some((entry) => entry.type === 'reload')) {
				state.detected = true;
				state.done = true;
				return;
			}

			if (performance.now() - startedAt >= timeoutMs) {
				state.done = true;
				return;
			}

			requestAnimationFrame(poll);
		};

		poll();
	}, timeout);
}

/** Tracks whether the main document performs a full reload during an HMR update. */
export function watchForMainFrameNavigation(page: Page, timeout = 10_000) {
	return page
		.waitForFunction(
			() => {
				const state = (window as EcoNavigationWindow & { __ecopagesReloadWatch?: { done?: boolean } })
					.__ecopagesReloadWatch;
				return state?.done === true;
			},
			null,
			{ timeout: timeout + 1_000 },
		)
		.then(async () => {
			return page.evaluate(() => {
				const state = (
					window as EcoNavigationWindow & {
						__ecopagesReloadWatch?: { detected?: boolean };
					}
				).__ecopagesReloadWatch;
				return state?.detected === true;
			});
		})
		.catch(() => false);
}

/** Asserts the main document does not perform a full navigation during an HMR update. */
export async function assertNoMainFrameNavigation(navigationWatch: Promise<boolean>) {
	expect(await navigationWatch, 'expected current-page refresh without a full document reload').toBe(false);
}
