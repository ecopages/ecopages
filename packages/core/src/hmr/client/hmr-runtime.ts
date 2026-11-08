/**
 * Ecopages HMR Runtime
 * Injected into the browser to handle Hot Module Replacement updates.
 */

import { getEcoNavigationRuntime } from '../../router/client/navigation-coordinator.ts';
import { applyModuleUpdate, resolveActiveModuleUrl } from './module-update.ts';
import { resetBuildErrors, reportBuildError } from './build-error-presentation.ts';

interface HMRPayload {
	type: 'reload' | 'error' | 'update' | 'css-update' | 'layout-update';
	path?: string;
	message?: string;
	timestamp?: number;
}

(function () {
	const WS_URL = 'ws://' + location.host + '/_hmr';
	let socket: WebSocket;
	let reconnectAttempts = 0;

	function connect() {
		socket = new WebSocket(WS_URL);

		socket.addEventListener('open', () => {
			console.log('[ecopages] HMR Connected');
			(window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ = true;
			reconnectAttempts = 0;
		});

		socket.addEventListener('message', async (event) => {
			try {
				const payload: HMRPayload = JSON.parse(event.data);
				await handleMessage(payload);
			} catch (e) {
				console.error('[ecopages] Invalid HMR message:', e);
			}
		});

		socket.addEventListener('close', () => {
			(window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ = false;
			if (reconnectAttempts < 10) {
				setTimeout(connect, 1000 * 2 ** reconnectAttempts);
				reconnectAttempts++;
			}
		});
	}

	/**
	 * @remarks
	 * Any update clears a shown build error first. An update that fails to build re-shows it, because the
	 * server broadcasts the error while it serves the update's module request.
	 */
	async function handleMessage(payload: HMRPayload) {
		const navigationRuntime = getEcoNavigationRuntime(window);

		if (payload.type !== 'error') {
			resetBuildErrors();
		}

		switch (payload.type) {
			case 'reload':
				await waitForNavigationToSettle(navigationRuntime);
				location.reload();
				break;
			case 'layout-update': {
				await waitForNavigationToSettle(navigationRuntime);
				await reloadPage();
				break;
			}
			case 'error':
				console.error('[ecopages] HMR Error:', payload.message);
				reportBuildError(payload.message ?? 'Unknown error');
				break;
			case 'update':
				if (payload.path) {
					await applyUpdate(payload.path, payload.timestamp);
				}
				break;
			case 'css-update':
				if (payload.path) {
					refreshStylesheet(payload.path);
				}
				break;
		}
	}

	async function applyUpdate(path: string, timestamp?: number) {
		const navigationRuntime = getEcoNavigationRuntime(window);

		await applyModuleUpdate(
			path,
			{
				getHandlers: () => window.__ECO_PAGES__?.hmrHandlers,
				getActivePageModule: () => window.__ECO_PAGES__?.page?.module,
				reloadCurrentPage: async (request) => Boolean(await navigationRuntime.reloadCurrentPage(request)),
				importModule: (url) => import(url),
				waitForSettled: async () => waitForNavigationToSettle(navigationRuntime),
				reloadPage,
			},
			timestamp,
		);
	}

	/**
	 * @remarks
	 * Prefers a soft reload by the navigation owner and falls back to a full document reload when none handles it.
	 */
	async function reloadPage() {
		const navigationRuntime = getEcoNavigationRuntime(window);
		const handled = await navigationRuntime.reloadCurrentPage({
			clearCache: true,
			moduleUrl: getActiveHmrModuleUrl(),
		});
		if (!handled) {
			location.reload();
		}
	}

	function getActiveHmrModuleUrl(): string | undefined {
		return resolveActiveModuleUrl(window.__ECO_PAGES__?.hmrHandlers ?? {}, window.__ECO_PAGES__?.page?.module);
	}

	async function waitForNavigationToSettle(navigationRuntime: ReturnType<typeof getEcoNavigationRuntime>) {
		if (!navigationRuntime.hasPendingNavigationTransaction()) {
			return;
		}

		await new Promise<void>((resolve) => {
			const startedAt = performance.now();
			const timeoutMs = 5_000;

			const poll = () => {
				if (!navigationRuntime.hasPendingNavigationTransaction()) {
					resolve();
					return;
				}

				if (performance.now() - startedAt >= timeoutMs) {
					resolve();
					return;
				}

				requestAnimationFrame(poll);
			};

			requestAnimationFrame(poll);
		});
	}

	/**
	 * Re-fetches the stylesheet links whose pathname is `href`, the exact href the server sent, through a `t` query.
	 *
	 * @remarks
	 * Both sides go through `URL`, so a path with a space or a non-ASCII character compares percent-encoded on both.
	 */
	function refreshStylesheet(href: string) {
		const pathname = new URL(href, location.href).pathname;
		document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
			const url = new URL(link.href, location.href);
			if (url.pathname !== pathname) return;
			url.searchParams.set('t', Date.now().toString());
			link.href = url.toString();
			console.log('[ecopages] CSS updated:', href);
		});
	}

	getEcoNavigationRuntime(window).enableReloadStatePreservation();
	connect();
})();
