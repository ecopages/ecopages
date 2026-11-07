import { expect, type Page } from '@playwright/test';

/**
 * E2E Test Constants and Helpers
 */

export const PORTS = {
	CORE: 3002,
	BROWSER_ROUTER: 4002,
	REACT_ROUTER: 4003,
} as const;

export const URLS = {
	CORE: `http://localhost:${PORTS.CORE}`,
	BROWSER_ROUTER: `http://localhost:${PORTS.BROWSER_ROUTER}`,
	REACT_ROUTER: `http://localhost:${PORTS.REACT_ROUTER}`,
} as const;

/**
 * Common test selectors
 */
export const SELECTORS = {
	BASE_LAYOUT: '[data-testid="base-layout"]',
	INDEX_PAGE: '[data-testid="index-page"]',
	ABOUT_PAGE: '[data-testid="about-page"]',
	POST_PAGE: '[data-testid="post-page"]',
	POST_TITLE: '[data-testid="post-title"]',
	LINK_HOME: '[data-testid="link-home"]',
	LINK_ABOUT: '[data-testid="link-about"]',
	LINK_POST: '[data-testid="link-post"]',
	LINK_MDX: '[data-testid="link-mdx"]',
	LINK_DOCS: '[data-testid="link-docs"]',
	MDX_CONTENT: '[data-testid="mdx-content"]',
	DOCS_PAGE: '[data-testid="docs-page"]',
} as const;

/**
 * Background colors used in fixture pages (for CSS verification)
 */
export const PAGE_COLORS = {
	INDEX: 'rgb(232, 245, 233)', // #e8f5e9
	ABOUT: 'rgb(227, 242, 253)', // #e3f2fd
	POST: 'rgb(255, 243, 224)', // #fff3e0
} as const;

export async function waitForPageReady(page: Page, href?: string) {
	const targetUrl = href ? new URL(href, page.url()) : undefined;

	if (targetUrl) {
		await expect(page).toHaveURL(`${targetUrl.pathname}${targetUrl.search}`, { timeout: 10000 });
	}

	await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
	await page.waitForFunction(
		() => document.readyState !== 'loading' && !!document.body && document.body.childElementCount > 0,
		null,
		{
			timeout: 10000,
		},
	);
}

export async function gotoAndWait(page: Page, href: string) {
	await page.goto(href, { waitUntil: 'commit' });
	await waitForPageReady(page, href);
}

/**
 * Waits until `owner` has claimed the page's navigation runtime.
 *
 * @remarks
 * A router claims ownership after it attaches its `popstate` listener, so from then on a back or forward
 * traversal is rendered by that router. A traversal before it only changes the URL over the server HTML.
 */
export async function waitForNavigationOwner(page: Page, owner: string) {
	await page.waitForFunction((expected) => {
		const state = window.__ECO_PAGES__?.navigation?.getOwnerState();
		return state?.owner === expected && state.canHandleSpaNavigation;
	}, owner);
}
