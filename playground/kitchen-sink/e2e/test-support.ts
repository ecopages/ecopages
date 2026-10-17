import { expect } from '@playwright/test';
import type { APIRequestContext, ConsoleMessage, Page } from 'playwright-core';
export { assertNoForbiddenHmrDiagnostics, trackRuntimeErrors } from '../../../e2e/utils/runtime-error-tracker.ts';

const NAVIGATION_TIMEOUT = 45_000;
const HMR_CLIENT_CONNECT_TIMEOUT_MS = 60_000;
/** Post-mutation assert window for isolated kitchen-sink HMR cells on slower hosts. */
export const HMR_MUTATION_ASSERT_TIMEOUT_MS = 25_000;
/** Post-mutation window for fallback updates that need a full route render. */
export const HMR_FULL_RELOAD_ASSERT_TIMEOUT_MS = 45_000;

type EcoNavigationWindow = Window & {
	__ECO_PAGES__?: {
		navigation?: {
			hasPendingNavigationTransaction?: () => boolean;
			cancelCurrentNavigationTransaction?: () => void;
		};
	};
};

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

/** Plain document navigation without morph-transaction machinery. */
export async function gotoPathSimple(page: Page, href: string) {
	const targetPath = normalizePath(href);
	await page.goto(targetPath, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT });
	await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
}

/** Document navigation with morph-transaction settling (rapid-navigation stress specs only). */
export async function gotoPathWithMorphSettling(page: Page, href: string) {
	const targetPath = normalizePath(href);

	await cancelPendingNavigation(page);
	await waitForNavigationIdle(page, 2_000);
	await page.goto(targetPath, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT });
	await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
	await waitForNavigationIdle(page, 5_000);
}

/** Document navigation for kitchen-sink e2e hosts. */
export async function gotoPath(page: Page, href: string) {
	await gotoPathSimple(page, href);
}

/** Recover document state after rapid in-app hops before content assertions. */
export async function recoverToPath(page: Page, href: string) {
	await gotoPathSimple(page, href);
}

/** DOM click that bypasses Playwright's navigation-gate actionability checks. */
export async function clickByTestId(page: Page, testId: string) {
	await page.getByTestId(testId).click();
}

/**
 * Asserts declared layout/page scripts are served from the HMR dist path on cold start.
 */
export async function assertRegisteredHmrScript(page: Page, scriptPathFragment: string) {
	const script = page.locator(`script[src*="/assets/__eco_dev__/"][src*="${scriptPathFragment}"]`);
	await expect(script, `expected dev transform script containing ${scriptPathFragment}`).toHaveCount(1);
	return script;
}

/** Makes one GET request and throws with the status and response excerpt for non-2xx results. */
export async function requestGetAndWait(request: APIRequestContext, href: string, timeout = 30000) {
	const response = await request.get(href, { timeout });
	if (response.ok()) return response;

	const bodyExcerpt = (await response.text()).trim().slice(0, 300);
	const details = bodyExcerpt ? `: ${bodyExcerpt}` : '';
	throw new Error(`GET ${href} returned HTTP ${response.status()}${details}`);
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

			console.log(`[e2e-hmr-timing] ${testName} :: ${phase} +${sincePrevious}ms (total ${sinceStart}ms)`);
		},
	};
}

/** Installs a reload detector before navigation so it survives document replacements. */
export async function installFullDocumentReloadWatcher(page: Page) {
	await page.addInitScript(() => {
		const state = { detected: false, done: false };
		(window as EcoNavigationWindow & { __ecopagesReloadWatch?: typeof state }).__ecopagesReloadWatch = state;
		const initialNavigationCount = performance.getEntriesByType('navigation').length;

		const poll = () => {
			if (state.done) {
				return;
			}

			const entries = performance.getEntriesByType('navigation');
			if (
				entries
					.slice(initialNavigationCount)
					.some((entry) => entry.entryType === 'navigation' && 'type' in entry && entry.type === 'reload')
			) {
				state.detected = true;
				state.done = true;
				return;
			}

			requestAnimationFrame(poll);
		};

		poll();
	});
}

/** Ends reload observation early and returns whether a full document reload was detected. */
export async function finalizeMainFrameNavigationWatch(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const state = (
			window as EcoNavigationWindow & {
				__ecopagesReloadWatch?: { detected?: boolean; done?: boolean };
			}
		).__ecopagesReloadWatch;

		if (state) {
			state.done = true;
		}

		return state?.detected === true;
	});
}

/**
 * Asserts HMR refreshed in-place without a full reload.
 *
 * Finalizes the reload watcher immediately after the content assertion instead of
 * waiting for the legacy 10s observation window to expire.
 */
export async function assertNoMainFrameNavigationAfterHmr(page: Page, settleMs = 250) {
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const state = (
						window as EcoNavigationWindow & {
							__ecopagesReloadWatch?: { detected?: boolean };
						}
					).__ecopagesReloadWatch;
					return state?.detected === true;
				}),
			{
				timeout: settleMs,
				intervals: [25, 50, 100],
			},
		)
		.toBe(false);

	const reloaded = await finalizeMainFrameNavigationWatch(page);
	expect(reloaded, 'expected current-page refresh without a full document reload').toBe(false);
}

/** @deprecated Prefer {@link assertNoMainFrameNavigationAfterHmr} — this waits until the reload watch times out when no reload occurs. */
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
