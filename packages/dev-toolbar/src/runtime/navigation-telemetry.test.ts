import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
	initNavigationTelemetry,
	NAV_TELEMETRY_ELEMENT_ID,
	NAV_TELEMETRY_STORAGE_KEY,
	readNavigationTelemetrySnapshot,
	resetNavigationTelemetryForTests,
} from './navigation-telemetry.ts';

function createStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear() {
			store.clear();
		},
		getItem(key: string) {
			return store.get(key) ?? null;
		},
		key(index: number) {
			return [...store.keys()][index] ?? null;
		},
		removeItem(key: string) {
			store.delete(key);
		},
		setItem(key: string, value: string) {
			store.set(key, value);
		},
	};
}

function createDocumentHarness() {
	const elements = new Map<string, HTMLElement>();
	const listeners = new Map<string, Set<() => void>>();
	const head = {
		append(element: HTMLElement) {
			if (element.id) {
				elements.set(element.id, element);
			}
		},
	};
	const body = {
		append(element: HTMLElement) {
			if (element.id) {
				elements.set(element.id, element);
			}
		},
	};
	const addEventListener = vi.fn((event: string, listener: () => void) => {
		const handlers = listeners.get(event) ?? new Set<() => void>();
		handlers.add(listener);
		listeners.set(event, handlers);
	});
	const removeEventListener = vi.fn((event: string, listener: () => void) => {
		listeners.get(event)?.delete(listener);
	});
	const doc = {
		body,
		head,
		readyState: 'complete' as DocumentReadyState,
		addEventListener,
		removeEventListener,
		createElement: vi.fn(() => {
			const element = {
				id: '',
				textContent: '',
				setAttribute: vi.fn(),
			};
			return element as unknown as HTMLElement;
		}),
		getElementById(id: string) {
			return elements.get(id) ?? null;
		},
		dispatchEvent: vi.fn(),
	};

	return { addEventListener, doc: doc as unknown as Document, elements, listeners, removeEventListener };
}

describe('navigation telemetry', () => {
	beforeEach(() => {
		resetNavigationTelemetryForTests();
		vi.stubGlobal('window', {
			location: {
				pathname: '/',
				search: '',
			},
		});
		vi.stubGlobal('localStorage', createStorage());
		vi.stubGlobal('performance', {
			now: () => 120,
			timeOrigin: Date.now() - 120,
			getEntriesByType: () => [
				{
					responseStart: 12,
					domInteractive: 40,
					loadEventEnd: 95,
					domContentLoadedEventEnd: 80,
				},
			],
		});
		vi.stubGlobal('location', {
			pathname: '/',
			search: '',
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('records an initial load entry and writes the DOM trace in document.head', () => {
		const { doc, elements, listeners } = createDocumentHarness();
		const api = initNavigationTelemetry(doc);

		recordInitialLoadViaPageLoad(listeners);

		const snapshot = api.getSnapshot();
		expect(snapshot.history).toHaveLength(1);
		expect(snapshot.history[0]?.kind).toBe('initial');
		expect(snapshot.history[0]?.durationMs).toBe(95);
		expect(elements.get(NAV_TELEMETRY_ELEMENT_ID)?.textContent).toContain('"kind":"initial"');
	});

	it('reuses the browser runtime when HMR re-evaluates the telemetry module', async () => {
		const { addEventListener, doc } = createDocumentHarness();
		const api = initNavigationTelemetry(doc);

		vi.resetModules();
		const reloadedModule = await import('./navigation-telemetry.ts');
		const reloadedApi = reloadedModule.initNavigationTelemetry(doc);

		expect(reloadedApi).toBe(api);
		expect(addEventListener.mock.calls.filter(([event]) => event === 'eco:page-load')).toHaveLength(1);
		reloadedModule.resetNavigationTelemetryForTests();
	});

	it('records client navigation durations across swap events', () => {
		const { doc, listeners } = createDocumentHarness();
		initNavigationTelemetry(doc);
		recordInitialLoadViaPageLoad(listeners);

		let now = 120;
		vi.stubGlobal('performance', {
			now: () => now,
			timeOrigin: Date.now() - 120,
			getEntriesByType: () => [],
		});

		listeners.get('eco:before-swap')?.forEach((handler) => handler());
		now = 250;
		listeners.get('eco:after-swap')?.forEach((handler) => handler());

		const snapshot = readNavigationTelemetrySnapshot(doc);
		const navigation = snapshot?.history.find((entry) => entry.kind === 'client-navigation');
		expect(navigation?.swapMs).toBe(130);
		expect(localStorage.getItem(NAV_TELEMETRY_STORAGE_KEY)).toContain('client-navigation');
	});

	it('escapes angle brackets in the DOM trace payload', () => {
		const { doc, elements, listeners } = createDocumentHarness();
		initNavigationTelemetry(doc);
		recordInitialLoadViaPageLoad(listeners);

		vi.stubGlobal('window', {
			location: {
				pathname: '/</script>',
				search: '',
			},
		});

		listeners.get('eco:before-swap')?.forEach((handler) => handler());
		listeners.get('eco:after-swap')?.forEach((handler) => handler());

		const trace = elements.get(NAV_TELEMETRY_ELEMENT_ID)?.textContent ?? '';
		expect(trace).toContain('\\u003c/script>');
		expect(() => JSON.parse(trace)).not.toThrow();
	});

	it('falls back to the in-memory API when the DOM trace element is missing', () => {
		const { doc, elements, listeners } = createDocumentHarness();
		const api = initNavigationTelemetry(doc);
		recordInitialLoadViaPageLoad(listeners);

		elements.delete(NAV_TELEMETRY_ELEMENT_ID);

		const snapshot = readNavigationTelemetrySnapshot(doc);
		expect(snapshot?.history).toEqual(api.getSnapshot().history);
	});

	it('records aborted navigations when a new swap starts before the previous one completes', () => {
		const { doc, listeners } = createDocumentHarness();
		initNavigationTelemetry(doc);
		recordInitialLoadViaPageLoad(listeners);

		let now = 200;
		vi.stubGlobal('performance', {
			now: () => now,
			timeOrigin: Date.now() - 200,
			getEntriesByType: () => [],
		});

		listeners.get('eco:before-swap')?.forEach((handler) => handler());
		now = 260;
		listeners.get('eco:before-swap')?.forEach((handler) => handler());
		now = 320;
		listeners.get('eco:after-swap')?.forEach((handler) => handler());

		const snapshot = readNavigationTelemetrySnapshot(doc);
		const aborted = snapshot?.history.filter((entry) => entry.status === 'aborted');
		const completed = snapshot?.history.filter(
			(entry) => entry.kind === 'client-navigation' && entry.status !== 'aborted',
		);

		expect(aborted).toHaveLength(1);
		expect(aborted?.[0]?.durationMs).toBe(60);
		expect(completed).toHaveLength(1);
		expect(completed?.[0]?.swapMs).toBe(60);
	});
});

function recordInitialLoadViaPageLoad(listeners: Map<string, Set<() => void>>): void {
	listeners.get('eco:page-load')?.forEach((handler) => handler());
}
