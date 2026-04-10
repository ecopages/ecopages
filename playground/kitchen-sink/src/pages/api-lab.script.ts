export {};

const commandSelector = '[data-api-command="true"]';

type CommandConfig = {
	body: string | null;
	curl: string;
	headers: Record<string, string>;
	label: string;
	method: string;
	path: string;
};

type ApiLabWindow = Window &
	typeof globalThis & {
		__ecopages_api_lab_cleanup__?: () => void;
	};

function parseCommand(button: HTMLButtonElement): CommandConfig {
	return {
		body: button.dataset.body || null,
		curl: button.dataset.curl || '',
		headers: JSON.parse(button.dataset.headers || '{}') as Record<string, string>,
		label: button.dataset.label || 'Unknown command',
		method: button.dataset.method || 'GET',
		path: button.dataset.path || '/',
	};
}

function mountApiLab(): () => void {
	const responseLabel = document.querySelector<HTMLElement>('[data-response-label]');
	const responseStatus = document.querySelector<HTMLElement>('[data-response-status]');
	const responseTime = document.querySelector<HTMLElement>('[data-response-time]');
	const responseRequest = document.querySelector<HTMLElement>('[data-response-request]');
	const responseBody = document.querySelector<HTMLElement>('[data-response-body]');
	const responseHeaders = document.querySelector<HTMLElement>('[data-response-headers]');
	const commandButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(commandSelector));

	if (commandButtons.length === 0 || !responseBody) {
		return () => undefined;
	}

	const abortController = new AbortController();

	function setSelected(button: HTMLButtonElement) {
		for (const candidate of commandButtons) {
			const isActive = candidate === button;
			candidate.dataset.selected = isActive ? 'true' : 'false';
			candidate.setAttribute('aria-pressed', isActive ? 'true' : 'false');
			candidate.classList.toggle('api-lab__command--selected', isActive);
		}
	}

	function setViewerState({
		label,
		request,
		status,
		time,
		body,
		headers,
	}: {
		label: string;
		request: string;
		status: string;
		time: string;
		body: string;
		headers: string;
	}) {
		if (responseLabel) responseLabel.textContent = label;
		if (responseRequest) responseRequest.textContent = request;
		if (responseStatus) responseStatus.textContent = status;
		if (responseTime) responseTime.textContent = time;
		if (responseBody) responseBody.textContent = body;
		if (responseHeaders) responseHeaders.textContent = headers;
	}

	async function runCommand(button: HTMLButtonElement) {
		const command = parseCommand(button);
		const url = new URL(command.path, window.location.origin);
		const requestPreview = `${command.method} ${url.pathname}${url.search}`;

		setSelected(button);
		setViewerState({
			label: command.label,
			request: `${requestPreview}\n${command.curl}`,
			status: 'Loading...',
			time: '... ms',
			body: 'Sending request...',
			headers: JSON.stringify(command.headers, null, 2),
		});

		const startedAt = performance.now();

		try {
			const response = await fetch(url, {
				body: command.body,
				headers: command.headers,
				method: command.method,
			});

			const elapsed = `${Math.round(performance.now() - startedAt)} ms`;
			const rawBody = await response.text();
			let formattedBody = rawBody;

			try {
				formattedBody = JSON.stringify(JSON.parse(rawBody), null, 2);
			} catch {
				formattedBody = rawBody;
			}

			const headerEntries = Object.fromEntries(response.headers.entries());

			setViewerState({
				label: command.label,
				request: `${requestPreview}\n${command.curl}`,
				status: `${response.status} ${response.statusText}`,
				time: elapsed,
				body: formattedBody || '[empty response]',
				headers: JSON.stringify(headerEntries, null, 2),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown request failure';
			setViewerState({
				label: command.label,
				request: `${requestPreview}\n${command.curl}`,
				status: 'Request failed',
				time: `${Math.round(performance.now() - startedAt)} ms`,
				body: message,
				headers: JSON.stringify(command.headers, null, 2),
			});
		}
	}

	for (const button of commandButtons) {
		button.addEventListener(
			'click',
			() => {
				void runCommand(button);
			},
			{ signal: abortController.signal },
		);
	}

	const initiallySelected = commandButtons.find((button) => button.dataset.selected === 'true') ?? commandButtons[0];
	setSelected(initiallySelected);
	setViewerState({
		label: initiallySelected.dataset.label || 'Ping with locals',
		request: initiallySelected.dataset.curl || 'Click a command to send a request from the browser.',
		status: 'Ready',
		time: '0 ms',
		body: 'Click Run to execute the selected command.',
		headers: JSON.stringify(JSON.parse(initiallySelected.dataset.headers || '{}'), null, 2),
	});

	return () => {
		abortController.abort();
	};
}

const runtimeWindow = window as ApiLabWindow;
runtimeWindow.__ecopages_api_lab_cleanup__?.();
runtimeWindow.__ecopages_api_lab_cleanup__ = mountApiLab();
