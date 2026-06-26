import type { Page } from 'playwright-core';
import {
	getPrimaryLinkTestId,
	getRouteLinkTestId,
	kitchenSinkShellTestId,
	primaryLinks,
} from '../src/data/primary-links';
import { cancelPendingNavigation, gotoPathWithMorphSettling, waitForNavigationIdle } from './test-support';

export async function fireRapidLinkClicks(page: Page, hops: string[]) {
	const entries = hops.map((href) => ({
		href,
		primaryTestId: getPrimaryLinkTestId(href),
		routeTestId: getRouteLinkTestId(href),
	}));

	await page.evaluate((items) => {
		for (const { href, primaryTestId, routeTestId } of items) {
			const link =
				document.querySelector<HTMLAnchorElement>(`[data-testid="${primaryTestId}"]`) ??
				document.querySelector<HTMLAnchorElement>(`[data-testid="${routeTestId}"]`) ??
				document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
			link?.click();
		}
	}, entries);

	// Rapid in-app hops can leave a morph transaction in flight; Playwright blocks
	// all locator assertions until navigation settles.
	await waitForNavigationIdle(page, 15_000);
	await cancelPendingNavigation(page);
	await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
}

/**
 * Recovers a document navigable state after rapid in-app hops.
 *
 * Morph transactions can finish without a visible shell; content specs hard-navigate
 * to a known route before asserting layout invariants.
 */
export async function settleAfterRapidHops(page: Page, recoveryPath = '/') {
	const shell = page.getByTestId(kitchenSinkShellTestId);
	const shellVisible = await shell.isVisible().catch(() => false);

	if (!shellVisible) {
		await gotoPathWithMorphSettling(page, recoveryPath);
		return;
	}

	await waitForNavigationIdle(page, 5_000);
}

/** Random hops from primary nav — the only links guaranteed in the shell during a click burst. */
export function randomHopSequence(count: number): string[] {
	const pool = primaryLinks.map((link) => link.href);
	const hops: string[] = [];

	for (let index = 0; index < count; index += 1) {
		hops.push(pool[Math.floor(Math.random() * pool.length)]!);
	}

	return hops;
}

export const broadTraversalSequence = [
	'/',
	'/react-lab',
	'/integration-matrix/lit-entry',
	'/docs',
	'/react-content',
	'/integration-matrix',
	'/react-server-files',
	'/patterns/middleware',
	'/integration-matrix/react-entry',
	'/catalog/semantic-html',
	'/postcss',
	'/react-server-metadata',
	'/images',
	'/explicit/team',
	'/transitions',
	'/latest',
	'/api-lab',
];

export const crossTechnologySequences = [
	['/docs', '/react-lab', '/integration-matrix/lit-entry', '/api-lab', '/react-content', '/postcss'],
	[
		'/integration-matrix/lit-entry',
		'/react-lab',
		'/patterns/middleware',
		'/react-content',
		'/latest',
		'/integration-matrix/react-entry',
	],
];
