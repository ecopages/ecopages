export {};

type ChatMessage = {
	id: string;
	username: string;
	text: string;
	ts: number;
};

type ChatLabWindow = Window &
	typeof globalThis & {
		__ecopages_ws_chat_cleanup__?: () => void;
	};

function buildWsUrl(username: string): string {
	const proto = location.protocol === 'https:' ? 'wss' : 'ws';
	const u = encodeURIComponent(username || 'anonymous');
	return `${proto}://${location.host}/ws/chat?username=${u}`;
}

function formatTime(ts: number): string {
	return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createMessageEl(msg: ChatMessage): HTMLElement {
	const row = document.createElement('div');
	row.className = 'chat-lab__message';
	row.dataset.messageId = msg.id;

	const user = document.createElement('span');
	user.className = 'chat-lab__message-user';
	user.textContent = msg.username;

	const time = document.createElement('span');
	time.className = 'chat-lab__message-time';
	time.textContent = formatTime(msg.ts);

	const text = document.createElement('span');
	text.className = 'chat-lab__message-text';
	text.textContent = msg.text;

	row.append(user, time, text);
	return row;
}

function mountChatLab(): () => void {
	const statusEl = document.querySelector<HTMLElement>('[data-chat-status]');
	const statusDot = document.querySelector<HTMLElement>('[data-chat-status-dot]');
	const usernameInput = document.querySelector<HTMLInputElement>('[data-chat-username]');
	const messagesEl = document.querySelector<HTMLElement>('[data-chat-messages]');
	const form = document.querySelector<HTMLFormElement>('[data-chat-form]');
	const chatInput = document.querySelector<HTMLInputElement>('[data-chat-input]');
	const sendBtn = document.querySelector<HTMLButtonElement>('[data-chat-send]');

	if (!messagesEl || !form || !chatInput) return () => undefined;

	const abortController = new AbortController();
	let ws: WebSocket | null = null;
	/**
	 * Track IDs we already rendered from SSR so we don't duplicate on history replay.
	 */
	const renderedIds = new Set<string>(
		Array.from(messagesEl.querySelectorAll('[data-message-id]')).map(
			(el) => (el as HTMLElement).dataset.messageId ?? '',
		),
	);

	let currentUsername = '';

	function setStatus(state: 'connecting' | 'connected' | 'disconnected') {
		if (statusEl) statusEl.textContent = state;
		if (statusEl) statusEl.dataset.chatStatus = state;
		if (statusDot) statusDot.dataset.chatStatusDot = state;
	}

	function appendMessage(msg: ChatMessage) {
		if (renderedIds.has(msg.id)) return;
		renderedIds.add(msg.id);
		const el = createMessageEl(msg);
		messagesEl!.appendChild(el);
		messagesEl!.scrollTop = messagesEl!.scrollHeight;
	}

	function connect() {
		const username = usernameInput?.value.trim() || 'anonymous';
		currentUsername = username;
		setStatus('connecting');

		const socket = new WebSocket(buildWsUrl(username));
		ws = socket;

		socket.addEventListener('open', () => {
			if (ws !== socket) return;
			setStatus('connected');
			if (sendBtn) sendBtn.disabled = false;
		});

		socket.addEventListener('message', (ev) => {
			if (ws !== socket) return;
			let payload: { type: string; messages?: ChatMessage[]; message?: ChatMessage };
			try {
				payload = JSON.parse(ev.data as string);
			} catch {
				return;
			}

			if (payload.type === 'history' && Array.isArray(payload.messages)) {
				for (const msg of payload.messages) appendMessage(msg);
			} else if (payload.type === 'message' && payload.message) {
				appendMessage(payload.message);
			}
		});

		socket.addEventListener('close', () => {
			if (ws === socket) {
				setStatus('disconnected');
				if (sendBtn) sendBtn.disabled = true;
				ws = null;
			}
		});

		socket.addEventListener('error', () => {
			if (ws === socket) {
				setStatus('disconnected');
			}
		});
	}

	form.addEventListener(
		'submit',
		(ev) => {
			ev.preventDefault();
			const text = chatInput.value.trim();
			if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
			ws.send(JSON.stringify({ type: 'message', text }));
			chatInput.value = '';
		},
		{ signal: abortController.signal },
	);

	function handleUsernameChange() {
		const newUsername = usernameInput?.value.trim() || 'anonymous';
		if (newUsername !== currentUsername) {
			ws?.close();
			connect();
		}
	}

	usernameInput?.addEventListener(
		'change',
		() => {
			handleUsernameChange();
		},
		{ signal: abortController.signal },
	);

	usernameInput?.addEventListener(
		'keydown',
		(ev) => {
			if (ev.key === 'Enter') {
				handleUsernameChange();
			}
		},
		{ signal: abortController.signal },
	);

	if (sendBtn) sendBtn.disabled = true;
	connect();

	return () => {
		abortController.abort();
		ws?.close();
	};
}

const runtimeWindow = window as ChatLabWindow;
runtimeWindow.__ecopages_ws_chat_cleanup__?.();
runtimeWindow.__ecopages_ws_chat_cleanup__ = mountChatLab();
