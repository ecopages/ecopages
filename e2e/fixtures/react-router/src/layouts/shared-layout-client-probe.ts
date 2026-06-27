type SharedLayoutClientProbeState = {
	initializedAt: string;
	initCount: number;
	lastPathname: string;
	visitedPathnames: string[];
};

let moduleInitialized = false;

export function markSharedLayoutClientProbe() {
	if (moduleInitialized || typeof window === 'undefined') {
		return;
	}

	moduleInitialized = true;

	const runtimeWindow = window as Window &
		typeof globalThis & {
			__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__?: SharedLayoutClientProbeState;
		};

	const pathname = runtimeWindow.location.pathname;
	const state = runtimeWindow.__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__ ?? {
		initializedAt: new Date().toISOString(),
		initCount: 0,
		lastPathname: pathname,
		visitedPathnames: [],
	};

	state.initCount += 1;
	state.lastPathname = pathname;
	if (!state.visitedPathnames.includes(pathname)) {
		state.visitedPathnames.push(pathname);
	}

	runtimeWindow.__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__ = state;
	console.log(`[e2e-react-layout-chunk:init] ${state.initializedAt} count=${state.initCount} path=${pathname}`);
}
