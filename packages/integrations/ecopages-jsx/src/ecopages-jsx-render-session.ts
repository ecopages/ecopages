import { AsyncLocalStorage } from 'node:async_hooks';
import type { EcoComponent } from '@ecopages/core';
import { getActiveSsrScopeValue, withActiveSsrScopeValue } from '@ecopages/jsx/server';
import { mergeEjsxHmrOwnership, publishEjsxHmrOwnership } from './ecopages-jsx-hmr-ownership.ts';

type EcopagesJsxSsrRenderState = {
	pendingHmrFileOwners: Set<string>;
};

export const ECOPAGES_JSX_SSR_RENDER_STATE_KEY = Symbol.for('@ecopages/ecopages-jsx.ssr-render-state');
const renderStateStorage = new AsyncLocalStorage<EcopagesJsxSsrRenderState>();

function ensurePendingHmrFileOwners(state: EcopagesJsxSsrRenderState): Set<string> {
	if (!state.pendingHmrFileOwners) {
		state.pendingHmrFileOwners = new Set<string>();
	}
	return state.pendingHmrFileOwners;
}

function commitPendingHmrOwnership(state: EcopagesJsxSsrRenderState): void {
	const pending = state.pendingHmrFileOwners;
	if (!pending || pending.size === 0) {
		return;
	}

	publishEjsxHmrOwnership(pending);
	pending.clear();
}

async function runWithCommittedHmrOwnership<T>(
	state: EcopagesJsxSsrRenderState,
	render: () => T | Promise<T>,
): Promise<T> {
	try {
		return await render();
	} finally {
		commitPendingHmrOwnership(state);
	}
}

/**
 * Tracks JSX SSR HMR-ownership state for one active render flow.
 *
 * @remarks
 * The renderer still mirrors this state into `@ecopages/jsx/server` so nested
 * JSX renders and existing SSR-scope probes can observe it, but it also keeps
 * an internal async-local copy. That fallback avoids losing renderer state when
 * host runtimes such as Vite end up loading separate module identities for the
 * JSX server helpers.
 */
export class EcopagesJsxRenderSession {
	/**
	 * Runs one render inside the active session scope.
	 *
	 * @remarks
	 * When a render is already active, the current session state is reused and
	 * mirrored back into the JSX SSR scope so nested `renderToString()` calls see
	 * the same HMR-ownership set. When no session exists yet, a new state is
	 * created and published through both the internal async-local store and the
	 * JSX SSR scope bridge. HMR ownership accumulated during the outer scope is
	 * published once when that scope completes.
	 */
	async withActiveScope<T>(render: () => T | Promise<T>): Promise<T> {
		const activeState = renderStateStorage.getStore();
		if (activeState) {
			return await withActiveSsrScopeValue(ECOPAGES_JSX_SSR_RENDER_STATE_KEY, activeState, render);
		}

		const jsxScopeState = getActiveSsrScopeValue<EcopagesJsxSsrRenderState>(ECOPAGES_JSX_SSR_RENDER_STATE_KEY);
		if (jsxScopeState) {
			ensurePendingHmrFileOwners(jsxScopeState);
			return await runWithCommittedHmrOwnership(jsxScopeState, () =>
				renderStateStorage.run(jsxScopeState, () => render()),
			);
		}

		const state: EcopagesJsxSsrRenderState = {
			pendingHmrFileOwners: new Set<string>(),
		};

		return await runWithCommittedHmrOwnership(state, () =>
			renderStateStorage.run(state, () =>
				withActiveSsrScopeValue(ECOPAGES_JSX_SSR_RENDER_STATE_KEY, state, render),
			),
		);
	}

	mergeHmrOwnership(components: ReadonlyArray<EcoComponent | undefined>): void {
		mergeEjsxHmrOwnership(ensurePendingHmrFileOwners(this.getState()), components);
	}

	/**
	 * Resolves the current render-session state from the local async scope first.
	 *
	 * @remarks
	 * The fallback read from `@ecopages/jsx/server` keeps compatibility with code
	 * that still inspects the public SSR scope directly, while the async-local
	 * store remains the authoritative source for renderer-owned bookkeeping.
	 */
	private getState(): EcopagesJsxSsrRenderState {
		const state =
			renderStateStorage.getStore() ??
			getActiveSsrScopeValue<EcopagesJsxSsrRenderState>(ECOPAGES_JSX_SSR_RENDER_STATE_KEY);

		if (!state) {
			throw new Error('Ecopages JSX SSR render state is unavailable outside the active render scope.');
		}

		return state;
	}
}
