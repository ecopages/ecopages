/**
 * Resolves the React and react-dom/static modules used for SSR.
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
 * - The static prerender reports an error inside a Suspense boundary through `onError` and still
 *   resolves with that boundary's fallback, so the first reported error is rethrown: a
 *   failed render never returns fallback HTML.
 * - An unbounded `progressiveChunkSize` keeps resolved boundaries inline. With the default,
 *   React moves a large boundary after its fallback and reveals it with an inline script.
 *   A boundary that renders a `precedence` stylesheet is still moved, whatever its size.
 * - React prefixes an `<html>` root with a doctype; the document shell writes its own, so
 *   the prefix is dropped.
 * - The Node stream variant is used because the web-stream `prerender` is only in the Node
 *   build from react-dom 19.2, while the peer range allows any React 19.
 */
export async function renderReactHtml(runtime: ReactRuntimeModules, element: ReactNode): Promise<string> {
	let renderError: { error: unknown } | undefined;
	const { prelude } = await runtime.reactDomStatic.prerenderToNodeStream(element, {
		progressiveChunkSize: Number.POSITIVE_INFINITY,
		onError: (error) => {
			renderError ??= { error };
		},
	});
	if (renderError) {
		throw renderError.error;
	}

	const html = await text(prelude);
	return html.startsWith(DOCTYPE) ? html.slice(DOCTYPE.length) : html;
}
