/**
 * Ecopages HMR Runtime
 * Injected into the browser to handle Hot Module Replacement updates.
 */

import { getEcoNavigationRuntime } from '../../router/client/navigation-coordinator.ts';
import { applyModuleUpdate, resolveActiveModuleUrl } from './module-update.ts';

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

	async function handleMessage(payload: HMRPayload) {
		const navigationRuntime = getEcoNavigationRuntime(window);

		switch (payload.type) {
			case 'reload':
				await waitForNavigationToSettle(navigationRuntime);
				if ((window as Window & { __ECOPAGES_HOST_OWNS_RELOAD__?: boolean }).__ECOPAGES_HOST_OWNS_RELOAD__) {
					break;
				}
				location.reload();
				break;
			case 'layout-update': {
				await waitForNavigationToSettle(navigationRuntime);
				if (
					await navigationRuntime.reloadCurrentPage({
						clearCache: true,
						moduleUrl: getActiveHmrModuleUrl(),
					})
				) {
					break;
				}
				if ((window as Window & { __ECOPAGES_HOST_OWNS_RELOAD__?: boolean }).__ECOPAGES_HOST_OWNS_RELOAD__) {
					break;
				}
				location.reload();
				break;
			}
			case 'error':
				console.error('[ecopages] HMR Error:', payload.message);
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
			},
			timestamp,
		);
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
	 * Hot-reload CSS by updating stylesheet link href with cache-busting query param.
	 * This causes the browser to re-fetch the stylesheet without a full page reload.
	 */
	function refreshStylesheet(path: string) {
		const filename = path.split('/').pop() || '';
		const links = document.querySelectorAll('link[rel="stylesheet"]');

		links.forEach((link) => {
			const href = (link as HTMLLinkElement).href;
			if (href.includes(filename) || href.includes(path.replace(/^.*\/src\//, '/assets/'))) {
				const url = new URL(href, location.origin);
				url.searchParams.set('t', Date.now().toString());
				(link as HTMLLinkElement).href = url.toString();
				console.log('[ecopages] CSS updated:', filename);
			}
		});
	}

	connect();
})();
