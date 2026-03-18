/**
 * Ecopages HMR Runtime
 * Injected into the browser to handle Hot Module Replacement updates.
 */

import { getEcoNavigationRuntime } from '../../router/client/navigation-coordinator.ts';

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
			reconnectAttempts = 0;
		});

		socket.addEventListener('message', async (event) => {
			try {
				const payload: HMRPayload = JSON.parse(event.data);
				handleMessage(payload);
			} catch (e) {
				console.error('[ecopages] Invalid HMR message:', e);
			}
		});

		socket.addEventListener('close', () => {
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
				location.reload();
				break;
			case 'layout-update': {
				await waitForNavigationToSettle(navigationRuntime);
				if (await navigationRuntime.reloadCurrentPage({ clearCache: true })) {
				} else {
					location.reload();
				}
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

	/**
	 * Applies a module update by calling registered HMR handlers or re-importing the module.
	 * @param path - The module path to update
	 * @param timestamp - Optional timestamp for cache busting
	 */
	async function applyUpdate(path: string, timestamp?: number) {
		try {
			const url = path + '?t=' + (timestamp || Date.now());
			const handlers = window.__ECO_PAGES__?.hmrHandlers;
			const navigationRuntime = getEcoNavigationRuntime(window);
			await waitForNavigationToSettle(navigationRuntime);

			if (handlers?.[path]) {
				await handlers[path](url);
				return;
			}

			await import(url);

			// If we're inside the EcoRouter, we need to trigger a router navigation to render the new component.
			// Passing clearCache: false preserves the persisted layout cache.
			if (await navigationRuntime.reloadCurrentPage({ clearCache: false })) {
			}
		} catch (e) {
			console.error('[ecopages] Failed to apply HMR update:', e);
		}
	}

	async function waitForNavigationToSettle(navigationRuntime: ReturnType<typeof getEcoNavigationRuntime>) {
		if (!navigationRuntime.hasPendingNavigationTransaction()) {
			return;
		}

		await new Promise<void>((resolve) => {
			const startedAt = performance.now();
			const timeoutMs = 2000;

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
