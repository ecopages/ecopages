/**
 * Resolves the React and react-dom/static modules used for SSR, and renders React trees to HTML with them.
 *
 * @remarks
 * Prefers the app's own React install so SSR identity matches the app bundle.
 * Falls back to the integration's React when the app package cannot resolve them.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import type { ReactNode } from 'react';
import type { ReactRuntime } from './layout-compose.ts';

export type ReactRuntimeModules = {
	react: ReactRuntime;
	reactDomStatic: typeof import('react-dom/static');
};

export function resolveReactRuntimeModules(rootDir: string | undefined): ReactRuntimeModules {
	const appPackageJsonPath = path.resolve(rootDir || process.cwd(), 'package.json');

	try {
		const requireFromApp = createRequire(appPackageJsonPath);

		return {
			react: requireFromApp('react') as ReactRuntime,
			reactDomStatic: requireFromApp('react-dom/static'),
		};
	} catch {
		const requireFromIntegration = createRequire(import.meta.url);

		return {
			react: requireFromIntegration('react') as ReactRuntime,
			reactDomStatic: requireFromIntegration('react-dom/static'),
		};
	}
}

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Renders a React tree to complete HTML, waiting for every Suspense boundary to resolve.
 *
 * @remarks
 * - No `onError` is passed, so React keeps its default: it logs every error with `console.error`.
 *   An error inside a Suspense boundary then serves that boundary's fallback for the browser to
 *   retry, as `renderToString` did, but now logged. An error outside every boundary is logged too
 *   and rejects the render, so the caller's own log of that failure repeats it.
 * - An unbounded `progressiveChunkSize` keeps resolved boundaries inline. With the default,
 *   React moves a large boundary after its fallback and reveals it with an inline script.
 *   A boundary that renders a `precedence` stylesheet is still moved, whatever its size.
 * - React prefixes an `<html>` root with a doctype; the document shell writes its own, so
 *   the prefix is dropped.
 * - The Node stream variant is used because the web-stream `prerender` is only in the Node
 *   build from react-dom 19.2, while the peer range allows any React 19.
 */
export async function renderReactHtml(runtime: ReactRuntimeModules, element: ReactNode): Promise<string> {
	const { prelude } = await runtime.reactDomStatic.prerenderToNodeStream(element, {
		progressiveChunkSize: Number.POSITIVE_INFINITY,
	});

	const html = await text(prelude);
	return html.startsWith(DOCTYPE) ? html.slice(DOCTYPE.length) : html;
}
