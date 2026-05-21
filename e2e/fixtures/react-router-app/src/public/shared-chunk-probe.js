const runtimeWindow = window;
const state = runtimeWindow.__ECO_E2E_SHARED_CHUNK__ ?? {
	initializedAt: new Date().toISOString(),
	initCount: 0,
	logCount: 0,
	rerunCount: 0,
	lastPathname: window.location.pathname,
};

state.initCount += 1;
state.logCount += 1;
state.lastPathname = window.location.pathname;

runtimeWindow.__ECO_E2E_SHARED_CHUNK__ = state;
runtimeWindow.__ECO_PAGES__ = runtimeWindow.__ECO_PAGES__ || {};
runtimeWindow.__ECO_PAGES__.rerunScripts = runtimeWindow.__ECO_PAGES__.rerunScripts || {};
runtimeWindow.__ECO_PAGES__.rerunScripts['shared-chunk-probe'] = () => {
	const nextState = runtimeWindow.__ECO_E2E_SHARED_CHUNK__;
	if (!nextState) {
		return;
	}

	nextState.rerunCount += 1;
	nextState.lastPathname = window.location.pathname;
	const marker = document.documentElement;
	if (marker) {
		marker.setAttribute('data-shared-chunk-rerun', String(nextState.rerunCount));
	}
};

console.log(`[e2e-shared-chunk:init] ${state.initializedAt} count=${state.initCount}`);
