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
	await page
		.waitForFunction(() => document.readyState !== 'loading' && !!document.body, null, {
			timeout: 10000,
		})
		.catch(() => undefined);
	await expect
		.poll(
			async () => {
				try {
					return await page.evaluate(() => !!document.body && document.body.childElementCount > 0);
				} catch {
					return false;
				}
			},
			{ timeout: 10000 },
		)
		.toBe(true);
}

export async function gotoAndWait(page: Page, href: string) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await page.goto(href, { waitUntil: 'domcontentloaded' });
			break;
		} catch (error) {
			const isTransientNavigationError =
				error instanceof Error &&
				/(net::ERR_ABORTED|net::ERR_CONNECTION_RESET|net::ERR_NETWORK_IO_SUSPENDED|frame was detached)/i.test(
					error.message,
				);

			if (!isTransientNavigationError || attempt === 2) {
				throw error;
			}
		}
	}

	await waitForPageReady(page, href);
}
