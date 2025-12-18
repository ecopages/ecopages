// src/hmr/client/hmr-runtime.ts
(function () {
	console.log('[ecopages] HMR Client initializing...');
	const WS_URL = 'ws://' + location.host + '/_hmr';
	let socket;
	let reconnectAttempts = 0;
	function connect() {
		socket = new WebSocket(WS_URL);
		socket.addEventListener('open', () => {
			console.log('[ecopages] HMR Connected');
			reconnectAttempts = 0;
		});
		socket.addEventListener('message', async (event) => {
			try {
				const payload = JSON.parse(event.data);
				handleMessage(payload);
			} catch (e) {
				console.error('[ecopages] Invalid HMR message:', e);
			}
		});
		socket.addEventListener('close', () => {
			console.log('[ecopages] HMR Disconnected');
			if (reconnectAttempts < 10) {
				setTimeout(connect, 1000 * 2 ** reconnectAttempts);
				reconnectAttempts++;
			}
		});
	}
	async function handleMessage(payload) {
		console.log('[ecopages] HMR Event:', payload.type, payload.path);
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
		}
	}
	async function applyUpdate(path, timestamp) {
		try {
			const url = path + '?t=' + (timestamp || Date.now());
			console.log('[ecopages] Fetching update:', url);
			await import(url);
			console.log('[ecopages] Update applied for', path);
		} catch (e) {
			console.error('[ecopages] Failed to apply update:', e);
			location.reload();
		}
	}
	connect();
})();
