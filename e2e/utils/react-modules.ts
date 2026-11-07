import type { Page, Response } from '@playwright/test';

/**
 * Matches the `exports.useState = function` assignment of React's own CommonJS build, development or minified.
 *
 * @remarks
 * React DOM and the reconciler only reference `useState` through dispatcher objects (`useState: mountState`), so
 * a JavaScript file that matches holds a copy of the `react` package.
 */
const REACT_PACKAGE_MARKER = /\.useState\s*=\s*function/u;

/** A JavaScript response that holds a copy of the `react` package. */
export type ReactModuleResponse = {
	url: string;
	cacheControl: string | undefined;
};

/**
 * Records every JavaScript file the page loads that holds a copy of the `react` package.
 *
 * @remarks
 * Call it before the first navigation. A page that loads React once reports exactly one file, whatever chunk
 * holds it; a page that also inlines React into a page bundle reports two.
 */
export function trackReactModules(page: Page): () => Promise<ReactModuleResponse[]> {
	const pending: Promise<ReactModuleResponse | undefined>[] = [];
	const inspect = async (response: Response): Promise<ReactModuleResponse | undefined> => {
		const headers = response.headers();
		if (!headers['content-type']?.includes('javascript') || response.status() !== 200) return undefined;
		const body = await response.text().catch(() => '');
		return REACT_PACKAGE_MARKER.test(body)
			? { url: new URL(response.url()).pathname, cacheControl: headers['cache-control'] }
			: undefined;
	};
	page.on('response', (response) => {
		pending.push(inspect(response));
	});
	return async () => {
		const found = (await Promise.all(pending)).filter((module) => module !== undefined);
		return [...new Map(found.map((module) => [module.url, module])).values()];
	};
}
