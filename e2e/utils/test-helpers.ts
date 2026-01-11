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
	MDX_CONTENT: '[data-testid="mdx-content"]',
} as const;

/**
 * Background colors used in fixture pages (for CSS verification)
 */
export const PAGE_COLORS = {
	INDEX: 'rgb(232, 245, 233)', // #e8f5e9
	ABOUT: 'rgb(227, 242, 253)', // #e3f2fd
	POST: 'rgb(255, 243, 224)', // #fff3e0
} as const;
