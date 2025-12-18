/**
 * Ecopages HMR Runtime
 * Injected into the browser to handle Hot Module Replacement updates.
 */

interface HMRPayload {
	type: 'reload' | 'error' | 'update' | 'css-update';
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
		switch (payload.type) {
			case 'reload':
				location.reload();
				break;
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
			const handlers = (window as any).__ecopages_hmr_handlers__;

			if (handlers?.[path]) {
				await handlers[path](url);
				return;
			}

			await import(url);
		} catch (e) {
			console.error('[ecopages] Failed to apply HMR update:', e);
		}
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
