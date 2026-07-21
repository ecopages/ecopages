export const NAV_TELEMETRY_ELEMENT_ID = '__ECO_DEV_NAV_TELEMETRY__';
export const NAV_TELEMETRY_STORAGE_KEY = 'ecopages:dev-toolbar:nav-telemetry';
export const NAV_TELEMETRY_MAX_ENTRIES = 50;

export type NavigationTelemetryKind = 'initial' | 'client-navigation';

export type NavigationTelemetryStatus = 'completed' | 'aborted';

export type NavigationTimingMetrics = {
	ttfbMs?: number;
	domInteractiveMs?: number;
	loadEventMs?: number;
	domContentLoadedMs?: number;
};

export type NavigationTelemetryEntry = {
	id: string;
	kind: NavigationTelemetryKind;
	route: string;
	fromRoute?: string;
	startedAt: string;
	endedAt?: string;
	durationMs?: number;
	swapMs?: number;
	hydrationMs?: number;
	navigationOwner?: string;
	status?: NavigationTelemetryStatus;
	navigationTiming?: NavigationTimingMetrics;
};

export type NavigationTelemetrySummary = {
	initialLoadMs?: number;
	lastNavigationMs?: number;
	averageNavigationMs?: number;
	navigationCount: number;
};

export type NavigationTelemetrySnapshot = {
	updatedAt: string;
	currentRoute: string;
	active: NavigationTelemetryEntry | null;
	history: NavigationTelemetryEntry[];
	summary: NavigationTelemetrySummary;
};

type EcoNavigationWindow = Window & {
	__ECO_PAGES__?: {
		navigation?: {
			getNavigationOwner?: () => string | undefined;
		};
	};
	__ecopages_browser_router__?: unknown;
	__ECO_DEV_HYDRATION_MS__?: number;
	__ECO_DEV_NAV_TELEMETRY__?: NavigationTelemetryApi;
};

export type NavigationTelemetryApi = {
	getSnapshot: () => NavigationTelemetrySnapshot;
	clearHistory: () => NavigationTelemetrySnapshot;
};

let nextEntryId = 0;
let activeEntry: NavigationTelemetryEntry | null = null;
let history: NavigationTelemetryEntry[] = [];
let swapStartedAt: number | null = null;
let initialized = false;
let telemetryDocument: Document | undefined;

/** @internal */
export function resetNavigationTelemetryForTests(): void {
	initialized = false;
	telemetryDocument = undefined;
	nextEntryId = 0;
	activeEntry = null;
	history = [];
	swapStartedAt = null;
}

function createEntryId(): string {
	nextEntryId += 1;
	return `nav-${nextEntryId}`;
}

function getNavigationOwner(): string | undefined {
	const runtime = (window as EcoNavigationWindow).__ECO_PAGES__?.navigation;
	const owner = runtime?.getNavigationOwner?.();
	if (owner) {
		return owner;
	}
	if ((window as EcoNavigationWindow).__ecopages_browser_router__) {
		return 'browser-router';
	}
	return 'full-document';
}

function readHydrationMs(): number | undefined {
	const value = (window as EcoNavigationWindow).__ECO_DEV_HYDRATION_MS__;
	return typeof value === 'number' ? Math.round(value) : undefined;
}

function readNavigationTimingMetrics(): NavigationTimingMetrics | undefined {
	const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
	if (!entry) {
		return undefined;
	}

	return {
		ttfbMs: Math.round(entry.responseStart),
		domInteractiveMs: Math.round(entry.domInteractive),
		loadEventMs: Math.round(entry.loadEventEnd),
		domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
	};
}

function readPersistedHistory(): NavigationTelemetryEntry[] {
	try {
		const raw = localStorage.getItem(NAV_TELEMETRY_STORAGE_KEY);
		if (!raw) {
			return [];
		}

		const parsed = JSON.parse(raw) as NavigationTelemetryEntry[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function persistHistory(entries: NavigationTelemetryEntry[]): void {
	try {
		localStorage.setItem(NAV_TELEMETRY_STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// Ignore quota errors in dev tooling.
	}
}

function summarize(entries: NavigationTelemetryEntry[]): NavigationTelemetrySummary {
	const initial = entries.find((entry) => entry.kind === 'initial');
	const navigations = entries.filter(
		(entry) =>
			entry.kind === 'client-navigation' && entry.status !== 'aborted' && typeof entry.durationMs === 'number',
	);
	const durations = navigations.map((entry) => entry.durationMs as number);
	const averageNavigationMs =
		durations.length === 0
			? undefined
			: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);

	return {
		initialLoadMs: initial?.durationMs,
		lastNavigationMs: navigations[navigations.length - 1]?.durationMs,
		averageNavigationMs,
		navigationCount: navigations.length,
	};
}

function getTelemetryDocument(): Document {
	if (telemetryDocument) {
		return telemetryDocument;
	}

	return document;
}

function buildSnapshot(doc: Document = getTelemetryDocument()): NavigationTelemetrySnapshot {
	const route = `${window.location.pathname}${window.location.search}`;
	return {
		updatedAt: new Date().toISOString(),
		currentRoute: route,
		active: activeEntry,
		history,
		summary: summarize(history),
	};
}

function syncTelemetryElement(doc: Document = getTelemetryDocument()): NavigationTelemetrySnapshot {
	const snapshot = buildSnapshot(doc);
	let element = doc.getElementById(NAV_TELEMETRY_ELEMENT_ID);
	if (!element) {
		const script = doc.createElement('script');
		script.id = NAV_TELEMETRY_ELEMENT_ID;
		script.setAttribute('type', 'application/json');
		element = script;
		doc.body.append(element);
	}

	element.textContent = JSON.stringify(snapshot);
	(window as EcoNavigationWindow).__ECO_DEV_NAV_TELEMETRY__ = createNavigationTelemetryApi();
	return snapshot;
}

function finalizeEntry(
	entry: NavigationTelemetryEntry,
	patch: Partial<NavigationTelemetryEntry>,
): NavigationTelemetryEntry {
	const endedAt = patch.endedAt ?? new Date().toISOString();
	const completed: NavigationTelemetryEntry = {
		...entry,
		...patch,
		status: patch.status ?? entry.status ?? 'completed',
		endedAt,
		durationMs:
			patch.durationMs ??
			(typeof entry.durationMs === 'number'
				? entry.durationMs
				: Math.max(0, Math.round(performance.now() - performance.timeOrigin))),
		hydrationMs: patch.hydrationMs ?? readHydrationMs(),
		navigationOwner: patch.navigationOwner ?? getNavigationOwner(),
	};

	history = [...history, completed].slice(-NAV_TELEMETRY_MAX_ENTRIES);
	persistHistory(history);
	activeEntry = null;
	return completed;
}

function abortActiveNavigation(): void {
	if (!activeEntry || activeEntry.kind !== 'client-navigation') {
		return;
	}

	const durationMs = swapStartedAt === null ? undefined : Math.max(0, Math.round(performance.now() - swapStartedAt));

	finalizeEntry(activeEntry, {
		status: 'aborted',
		route: `${window.location.pathname}${window.location.search}`,
		durationMs,
		swapMs: durationMs,
	});
	swapStartedAt = null;
}

function beginClientNavigation(fromRoute: string): void {
	activeEntry = {
		id: createEntryId(),
		kind: 'client-navigation',
		route: fromRoute,
		fromRoute,
		startedAt: new Date().toISOString(),
		navigationOwner: getNavigationOwner(),
	};
	syncTelemetryElement();
}

function completeActiveNavigation(doc: Document, patch: Partial<NavigationTelemetryEntry> = {}): void {
	if (!activeEntry) {
		return;
	}

	const durationMs =
		patch.durationMs ??
		(swapStartedAt === null ? undefined : Math.max(0, Math.round(performance.now() - swapStartedAt)));

	finalizeEntry(activeEntry, {
		route: `${window.location.pathname}${window.location.search}`,
		swapMs: durationMs,
		durationMs,
		...patch,
	});
	swapStartedAt = null;
	syncTelemetryElement(doc);
}

function recordInitialLoad(doc: Document): void {
	if (history.some((entry) => entry.kind === 'initial')) {
		completeActiveNavigation(doc);
		return;
	}

	const navigationTiming = readNavigationTimingMetrics();
	const durationMs = navigationTiming?.loadEventMs ?? navigationTiming?.domContentLoadedMs;

	finalizeEntry(
		{
			id: createEntryId(),
			kind: 'initial',
			route: `${window.location.pathname}${window.location.search}`,
			startedAt: new Date(performance.timeOrigin).toISOString(),
			navigationTiming,
			navigationOwner: getNavigationOwner(),
		},
		{
			durationMs,
			hydrationMs: readHydrationMs(),
		},
	);

	syncTelemetryElement(doc);
}

function createNavigationTelemetryApi(): NavigationTelemetryApi {
	return {
		getSnapshot: () => buildSnapshot(),
		clearHistory: () => {
			history = [];
			activeEntry = null;
			persistHistory(history);
			return syncTelemetryElement();
		},
	};
}

/**
 * Boots route timing collection, DOM JSON trace export, and `window.__ECO_DEV_NAV_TELEMETRY__`.
 */
export function initNavigationTelemetry(doc: Document = document): NavigationTelemetryApi {
	if (initialized) {
		return createNavigationTelemetryApi();
	}

	initialized = true;
	telemetryDocument = doc;
	history = readPersistedHistory();

	const handleBeforeSwap = () => {
		abortActiveNavigation();
		swapStartedAt = performance.now();
		beginClientNavigation(`${window.location.pathname}${window.location.search}`);
	};

	const handleAfterSwap = () => {
		completeActiveNavigation(doc);
	};

	const handlePageLoad = () => {
		if (activeEntry?.kind === 'client-navigation') {
			completeActiveNavigation(doc);
			return;
		}

		recordInitialLoad(doc);
	};

	doc.addEventListener('eco:before-swap', handleBeforeSwap);
	doc.addEventListener('eco:after-swap', handleAfterSwap);
	doc.addEventListener('eco:page-load', handlePageLoad);

	if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
		recordInitialLoad(doc);
	} else {
		doc.addEventListener('DOMContentLoaded', () => recordInitialLoad(doc), { once: true });
	}

	const api = createNavigationTelemetryApi();
	(window as EcoNavigationWindow).__ECO_DEV_NAV_TELEMETRY__ = api;
	syncTelemetryElement(doc);
	return api;
}

export function readNavigationTelemetrySnapshot(doc: Document = document): NavigationTelemetrySnapshot | undefined {
	const element = doc.getElementById(NAV_TELEMETRY_ELEMENT_ID);
	if (!element?.textContent) {
		return undefined;
	}

	try {
		return JSON.parse(element.textContent) as NavigationTelemetrySnapshot;
	} catch {
		return undefined;
	}
}

/** Clears persisted navigation history and the DOM telemetry trace. */
export function clearNavigationTelemetryHistory(): NavigationTelemetrySnapshot | undefined {
	const api = (window as EcoNavigationWindow).__ECO_DEV_NAV_TELEMETRY__;
	return api?.clearHistory();
}
