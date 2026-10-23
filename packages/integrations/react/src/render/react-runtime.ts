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
import { Logger } from '@ecopages/logger';
import type { ReactNode } from 'react';
import type { ReactRuntime } from './layout-compose.ts';
import { REACT_SSR_RENDER_TIMEOUT_MS } from '../plugin/react.constants.ts';

export { REACT_SSR_RENDER_TIMEOUT_MS };

const appLogger = new Logger('[ReactSSR]');

export type RenderReactHtmlOptions = {
	/** Abort waiting for Suspense after this many milliseconds. @default {@link REACT_SSR_RENDER_TIMEOUT_MS} */
	timeoutMs?: number;
	/** Identity of the tree being rendered, used in the timeout warning. */
	label?: string;
};

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
 * - `onError` logs real render errors with `console.error`. An AbortError is ignored only after
 *   this render's timeout has fired, so an aborted fetch still logs. An error inside a Suspense
 *   boundary then serves that boundary's fallback for the browser to retry, as `renderToString`
 *   did, but now logged. An error outside every boundary is logged too and rejects the render, so
 *   the caller's own log of that failure repeats it. Abort from the render timeout is the warning
 *   below, not a logged error.
 * - An unbounded `progressiveChunkSize` keeps resolved boundaries inline. With the default,
 *   React moves a large boundary after its fallback and reveals it with an inline script.
 *   A boundary that renders a `precedence` stylesheet is still moved, whatever its size.
 * - React prefixes an `<html>` root with a doctype; the document shell writes its own, so
 *   the prefix is dropped.
 * - Waiting is bounded by `timeoutMs`. When the signal fires, unfinished boundaries stay in
 *   their fallback and the rest of the tree is served, the same outcome as a boundary that throws.
 * - The Node stream variant is used because the web-stream `prerender` is only in the Node
 *   build from react-dom 19.2, while the peer range allows any React 19.
 */
export async function renderReactHtml(
	runtime: ReactRuntimeModules,
	element: ReactNode,
	options: RenderReactHtmlOptions = {},
): Promise<string> {
	const timeoutMs = options.timeoutMs ?? REACT_SSR_RENDER_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const { prelude } = await runtime.reactDomStatic.prerenderToNodeStream(element, {
			progressiveChunkSize: Number.POSITIVE_INFINITY,
			signal: controller.signal,
			onError(error) {
				if (controller.signal.aborted && isAbortError(error)) {
					return;
				}
				console.error(error);
			},
		});

		const html = await text(prelude);
		if (controller.signal.aborted) {
			appLogger.warn(
				`React server rendering of ${options.label ?? 'a React tree'} stopped after ${timeoutMs}ms: a Suspense boundary did not settle in time.`,
			);
		}
		return html.startsWith(DOCTYPE) ? html.slice(DOCTYPE.length) : html;
	} finally {
		clearTimeout(timer);
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}
