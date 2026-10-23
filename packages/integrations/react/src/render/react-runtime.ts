/**
 * Resolves the React, react-dom/static and react-dom/server modules used for SSR, and renders React trees to HTML with them.
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
	reactDomServer: Pick<typeof import('react-dom/server'), 'renderToString'>;
};

export function resolveReactRuntimeModules(rootDir: string | undefined): ReactRuntimeModules {
	const appPackageJsonPath = path.resolve(rootDir || process.cwd(), 'package.json');

	try {
		const requireFromApp = createRequire(appPackageJsonPath);

		return {
			react: requireFromApp('react') as ReactRuntime,
			reactDomStatic: requireFromApp('react-dom/static'),
			reactDomServer: requireFromApp('react-dom/server'),
		};
	} catch {
		const requireFromIntegration = createRequire(import.meta.url);

		return {
			react: requireFromIntegration('react') as ReactRuntime,
			reactDomStatic: requireFromIntegration('react-dom/static'),
			reactDomServer: requireFromIntegration('react-dom/server'),
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
 *   A boundary that renders a `precedence` stylesheet is still moved; that HTML fails the
 *   render so the stylesheet is declared as a Dependency instead.
 * - React prefixes an `<html>` root with a doctype; the document shell writes its own, so
 *   the prefix is dropped.
 * - Waiting is bounded by the active {@link runWithRenderBudget} deadline, or by `timeoutMs` from
 *   now outside one. Past the deadline the tree still renders what needs no waiting. When the
 *   signal fires, unfinished boundaries stay in their fallback and the rest of the tree is served,
 *   the same outcome as a boundary that throws.
 * - `prerender` returns no HTML when the abort lands while the tree has no finished host element
 *   around its pending work: a shell still waiting outside every boundary, or a boundary at the
 *   root of the tree. The tree is then rendered once more with `renderToString`, which serves such
 *   a boundary's fallback, marked for the browser to render, and throws for a waiting shell. That
 *   throw fails the render. In development React writes into the marked boundary that
 *   `renderToString` does not support Suspense; the browser reports it as a recovered hydration
 *   error.
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

		const prerendered = await text(prelude);
		const html =
			timedOut && prerendered === '' ? renderFallbackHtml(runtime, element, options.label, budget) : prerendered;
		if (timedOut && !budget.warned) {
			budget.warned = true;
			appLogger.warn(
				`React server rendering of ${budget.label} stopped after ${budget.timeoutMs}ms: a Suspense boundary did not settle in time.`,
			);
		}
		const markup = html.startsWith(DOCTYPE) ? html.slice(DOCTYPE.length) : html;
		assertNoOutlinedSuspenseBoundary(markup, options.label);
		return markup.replace(REVEAL_TIMING_SCRIPT, '');
	} finally {
		clearTimeout(timer);
	}
}

function renderFallbackHtml(
	runtime: ReactRuntimeModules,
	element: ReactNode,
	label: string,
	budget: RenderBudget,
): string {
	try {
		return runtime.reactDomServer.renderToString(element);
	} catch (error) {
		throw new ReactRenderError(
			`React server rendering of ${label} produced no HTML: its shell did not finish within the ${budget.timeoutMs}ms render time limit.`,
			{ cause: error },
		);
	}
}

/**
 * @remarks
 * React still outlines a boundary that renders a `precedence` stylesheet, even
 * with an unbounded `progressiveChunkSize`. `<template id="B:` also marks
 * pending, errored and aborted boundaries that must keep serving their fallback,
 * so this looks for the completed hidden segment and its reveal script.
 */
function assertNoOutlinedSuspenseBoundary(html: string, label: string): void {
	if (html.includes('id="S:') && html.includes('$RC(')) {
		throw new ReactRenderError(
			`React server rendering of ${label} moved a Suspense boundary out of line. Declare the stylesheet as a Dependency instead of rendering a link with rel="stylesheet" and a precedence inside the boundary.`,
		);
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}
