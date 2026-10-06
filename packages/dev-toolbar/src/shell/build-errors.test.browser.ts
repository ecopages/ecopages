import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type {} from '@ecopages/core/declarations';
import {
	BUILD_ERROR_EVENT,
	BUILD_ERROR_CLEAR_EVENT,
	BUILD_ERROR_REQUEST_EVENT,
	type BuildErrorDetail,
} from '@ecopages/core/dev-toolbar/build-error-contract';
import { EcoDevToolbar } from './eco-dev-toolbar.tsx';
import { ensureDevToolbarStyles } from './ensure-dev-toolbar-styles.ts';

const BUILD_ERROR_OVERLAY_ID = '__ecopages_build_error__';

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

beforeAll(async () => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	vi.stubGlobal('WebSocket', FakeSocket);
	await import('@ecopages/core/hmr/client/hmr-runtime');
});

afterEach(() => {
	FakeSocket.instances[0]!.receive({ type: 'css-update' });
	document.querySelector('eco-dev-toolbar')?.remove();
});

it('shows an HMR error in the page and removes it on the next update', async () => {
	const socket = FakeSocket.instances[0]!;

	socket.receive({ type: 'error', message: 'syntax error in widget.ts' });
	await vi.waitFor(() =>
		expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.textContent).toContain('syntax error in widget.ts'),
	);

	socket.receive({ type: 'css-update', path: '/assets/missing.css' });
	await vi.waitFor(() => expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull());
});

it('shows unique errors in the toolbar, reveals stealth mode, and clears after recovery', async () => {
	ensureDevToolbarStyles();
	const toolbar = EcoDevToolbar.mount();
	toolbar.applyPreferences({ stealth: true });
	const socket = FakeSocket.instances[0]!;
	socket.receive({ type: 'error', message: 'syntax error <script> in widget.ts' });
	socket.receive({ type: 'error', message: 'syntax error <script> in widget.ts' });
	socket.receive({ type: 'error', message: 'second failure' });
	await vi.waitFor(() => expect(toolbar.querySelectorAll('pre').length).toBe(2));
	expect(toolbar.querySelector('pre')?.textContent).toBe('syntax error <script> in widget.ts');
	expect(toolbar.querySelector('pre script')).toBeNull();
	expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull();
	expect(toolbar.querySelector('[aria-label="Build errors"] .eco-dev-toolbar__badge')?.textContent).toBe('2');
	expect(toolbar.querySelector('.eco-dev-toolbar__shell')?.getAttribute('data-stealth')).toBeNull();
	await userEvent.click(toolbar.querySelector<HTMLButtonElement>('button[aria-label="Build errors"]')!);
	await vi.waitFor(() =>
		expect(toolbar.querySelector('button[aria-label="Build errors"]')?.getAttribute('aria-pressed')).toBe('false'),
	);
	await userEvent.click(toolbar.querySelector<HTMLButtonElement>('button[aria-label="Build errors"]')!);
	await vi.waitFor(() =>
		expect(toolbar.querySelector('button[aria-label="Build errors"]')?.getAttribute('aria-pressed')).toBe('true'),
	);
	socket.receive({ type: 'css-update' });
	await vi.waitFor(() => expect(toolbar.querySelectorAll('pre').length).toBe(0));
	expect(toolbar.querySelector('[aria-label="Build errors"] .eco-dev-toolbar__badge')).toBeNull();
	toolbar.applyPreferences({ stealth: false });
});

it('moves a pending fallback into a late toolbar and restores fallback after unmount', async () => {
	const socket = FakeSocket.instances[0]!;
	socket.receive({ type: 'error', message: 'pending error' });
	expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.textContent).toContain('pending error');
	await userEvent.click(document.getElementById(BUILD_ERROR_OVERLAY_ID)!.querySelector<HTMLButtonElement>('button')!);
	expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull();
	const toolbar = EcoDevToolbar.mount();
	await vi.waitFor(() => expect(toolbar.querySelector('pre')?.textContent).toBe('pending error'));
	expect(toolbar.querySelectorAll('pre')).toHaveLength(1);
	expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull();
	toolbar.remove();
	socket.receive({ type: 'error', message: 'unmounted error' });
	expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.textContent).toContain('unmounted error');
	socket.receive({ type: 'css-update' });
	document.documentElement.append(toolbar);
	await vi.waitFor(() => expect(toolbar.querySelector('pre')).toBeNull());
	expect(toolbar.querySelector('[aria-label="Build errors"] .eco-dev-toolbar__badge')).toBeNull();
});

it('lets a custom client claim errors synchronously and leaves fallback for unclaimed errors', () => {
	const claim = (event: Event) => event.preventDefault();
	window.addEventListener(BUILD_ERROR_EVENT, claim);
	try {
		FakeSocket.instances[0]!.receive({ type: 'error', message: 'custom presentation' });
		expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull();
	} finally {
		window.removeEventListener(BUILD_ERROR_EVENT, claim);
	}
	FakeSocket.instances[0]!.receive({ type: 'error', message: 'unclaimed error' });
	expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.textContent).toContain('unclaimed error');
});

it('replays active errors with selective ownership and clears custom clients after recovery', () => {
	const socket = FakeSocket.instances[0]!;
	socket.receive({ type: 'error', message: 'claimed failure' });
	socket.receive({ type: 'error', message: 'fallback failure' });
	const received: BuildErrorDetail[] = [];
	const claim = (event: Event) => {
		const detail = (event as CustomEvent<BuildErrorDetail>).detail;
		received.push(detail);
		if (detail.message === 'claimed failure') event.preventDefault();
	};
	const clear = vi.fn();
	window.addEventListener(BUILD_ERROR_EVENT, claim);
	window.addEventListener(BUILD_ERROR_CLEAR_EVENT, clear);
	try {
		window.dispatchEvent(new Event(BUILD_ERROR_REQUEST_EVENT));
		expect(received).toEqual([{ message: 'claimed failure' }, { message: 'fallback failure' }]);
		const fallback = document.getElementById(BUILD_ERROR_OVERLAY_ID)!;
		expect(fallback.textContent).not.toContain('claimed failure');
		expect(fallback.querySelectorAll('pre')).toHaveLength(1);
		expect(fallback.querySelector('pre')?.textContent).toBe('fallback failure');
		window.dispatchEvent(new Event(BUILD_ERROR_REQUEST_EVENT));
		expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)?.querySelectorAll('pre')).toHaveLength(1);
		socket.receive({ type: 'css-update' });
		expect(clear).toHaveBeenCalledTimes(1);
		expect(document.getElementById(BUILD_ERROR_OVERLAY_ID)).toBeNull();
		received.length = 0;
		window.dispatchEvent(new Event(BUILD_ERROR_REQUEST_EVENT));
		expect(received).toEqual([]);
	} finally {
		window.removeEventListener(BUILD_ERROR_EVENT, claim);
		window.removeEventListener(BUILD_ERROR_CLEAR_EVENT, clear);
	}
});
