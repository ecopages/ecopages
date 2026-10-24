/**
 * Resolves the React and react-dom/static modules used for SSR, and renders React trees to HTML with them.
 *
 * @remarks
 * Prefers the app's own React install so SSR identity matches the app bundle.
 * Falls back to the integration's React when the app package cannot resolve them.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { Logger } from '@ecopages/logger';
import type { ReactNode } from 'react';
import { ReactRenderError } from './errors.ts';
import type { ReactRuntime } from './layout-compose.ts';

const appLogger = new Logger('[ReactSSR]');

export type RenderReactHtmlOptions = {
	/** Milliseconds to wait for Suspense when no route render budget is active. */
	timeoutMs: number;
	/** Identity of the tree being rendered, used in timeout messages. */
	label: string;
};

/**
 * One deadline shared by every React tree rendered for a route.
 *
 * @remarks
 * `warned` keeps the timeout warning to one per budget when several trees run past the deadline.
 */
type RenderBudget = {
	deadline: number;
	timeoutMs: number;
	label: string;
	warned: boolean;
};

const renderBudgetStorage = new AsyncLocalStorage<RenderBudget>();

/**
 * Runs `render` with one Suspense deadline shared by every {@link renderReactHtml} call inside it.
 *
 * @remarks
 * A route render makes several sequential React renders (the Page tree, queued children, each
 * component). Without a shared deadline each would wait the full limit, so a route could wait a
 * multiple of it.
 */
export function runWithRenderBudget<T>(options: RenderReactHtmlOptions, render: () => Promise<T>): Promise<T> {
	return renderBudgetStorage.run(
		{ deadline: Date.now() + options.timeoutMs, timeoutMs: options.timeoutMs, label: options.label, warned: false },
		render,
	);
}

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
 * React's inline timing script, written after the root element (inside `<body>` for an `<html>`
 * root) when a boundary is still pending or moved out of line.
 *
 * @remarks
 * It only feeds React's client reveal timing for streamed boundaries, which a complete document
 * never uses. Left in, it makes the output two root nodes, so an Island Host loses its host
 * attributes and never hydrates, and it is an inline script a strict CSP blocks. The pattern is
 * React's exact output, so user markup is never matched.
 */
const REVEAL_TIMING_SCRIPT =
	/<script(?: id="_R_")?>requestAnimationFrame\(function\(\)\{\$RT=performance\.now\(\)\}\);<\/script>/;

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
 * - Waiting is bounded by the active {@link runWithRenderBudget} deadline, or by `timeoutMs` from
 *   now outside one. Past the deadline the tree still renders what needs no waiting. When the
 *   signal fires, unfinished boundaries stay in their fallback and the rest of the tree is served,
 *   the same outcome as a boundary that throws.
 * - React returns no HTML when the abort lands before the shell finished, which includes a
 *   pending boundary at the root of the tree. That fails the render instead of serving an empty
 *   tree.
 * - The Node stream variant is used because the web-stream `prerender` is only in the Node
 *   build from react-dom 19.2, while the peer range allows any React 19.
 */
export async function renderReactHtml(
	runtime: ReactRuntimeModules,
	element: ReactNode,
	options: RenderReactHtmlOptions,
): Promise<string> {
	const budget = renderBudgetStorage.getStore() ?? {
		deadline: Date.now() + options.timeoutMs,
		timeoutMs: options.timeoutMs,
		label: options.label,
		warned: false,
	};
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.max(0, budget.deadline - Date.now()));

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
		const timedOut = controller.signal.aborted;
		clearTimeout(timer);

		const html = await text(prelude);
		if (timedOut && html === '') {
			throw new ReactRenderError(
				`React server rendering of ${options.label} produced no HTML: its shell did not finish within the ${budget.timeoutMs}ms render time limit.`,
			);
		}
		if (timedOut && !budget.warned) {
			budget.warned = true;
			appLogger.warn(
				`React server rendering of ${budget.label} stopped after ${budget.timeoutMs}ms: a Suspense boundary did not settle in time.`,
			);
		}
		const markup = html.startsWith(DOCTYPE) ? html.slice(DOCTYPE.length) : html;
		return markup.replace(REVEAL_TIMING_SCRIPT, '');
	} finally {
		clearTimeout(timer);
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}
