import { afterAll, expect, it, vi } from 'vitest';
import { BUILD_ERROR_OVERLAY_ID } from './build-error-overlay.ts';

class FakeSocket {
	static readonly instances: FakeSocket[] = [];
	private readonly listeners = new Map<string, (event: { data?: string }) => unknown>();

	constructor(readonly url: string) {
		FakeSocket.instances.push(this);
	}

	addEventListener(type: string, listener: (event: { data?: string }) => unknown): void {
		this.listeners.set(type, listener);
	}

	receive(payload: object): void {
		this.listeners.get('message')?.({ data: JSON.stringify(payload) });
	}
}

afterAll(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('shows an HMR error in the page and removes it on the next update', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	vi.stubGlobal('WebSocket', FakeSocket);
	await import('./hmr-runtime.ts');
	const socket = FakeSocket.instances[0]!;

	socket.receive({ type: 'error', message: 'syntax error in widget.ts' });
	await vi.waitFor(() =>
		expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.textContent).toContain('syntax error in widget.ts'),
	);

	socket.receive({ type: 'css-update', path: '/assets/missing.css' });
	await vi.waitFor(() => expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull());
});

it('keeps an HMR error visible when it follows an update in the same batch', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	vi.stubGlobal('WebSocket', FakeSocket);
	await import('./hmr-runtime.ts');
	const socket = FakeSocket.instances[0]!;
	const handler = vi.fn(async () => undefined);
	(window as Window & { __ECO_PAGES__?: unknown }).__ECO_PAGES__ = {
		hmrHandlers: { '/@eco/dev/widget.js': handler },
	};

	socket.receive({ type: 'update', path: '/@eco/dev/widget.js', timestamp: 1 });
	socket.receive({ type: 'error', message: 'syntax error in other.ts' });

	await vi.waitFor(() => expect(handler).toHaveBeenCalled());
	await vi.waitFor(() =>
		expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.textContent).toContain('syntax error in other.ts'),
	);

	socket.receive({ type: 'css-update', path: '/assets/missing.css' });
	await vi.waitFor(() => expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull());
	delete (window as Window & { __ECO_PAGES__?: unknown }).__ECO_PAGES__;
});
