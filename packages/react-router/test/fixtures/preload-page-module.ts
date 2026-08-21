type PreloadFixtureState = {
	started: boolean;
	completed: boolean;
	props: Record<string, unknown> | undefined;
	release: (() => void) | undefined;
};

const FIXTURE_STATE_KEY = '__ECO_PRELOAD_PAGE_FIXTURE__';

function getState(): PreloadFixtureState {
	const globals = globalThis as Record<string, PreloadFixtureState | undefined>;
	const existing = globals[FIXTURE_STATE_KEY];
	if (existing) {
		return existing;
	}

	const state: PreloadFixtureState = {
		started: false,
		completed: false,
		props: undefined,
		release: undefined,
	};
	globals[FIXTURE_STATE_KEY] = state;
	return state;
}

export function resetPreloadFixture(): void {
	const state = getState();
	state.started = false;
	state.completed = false;
	state.props = undefined;
	state.release = undefined;
}

export function getPreloadFixtureState(): PreloadFixtureState {
	return getState();
}

export async function preload(props: Record<string, unknown>): Promise<void> {
	const state = getState();
	state.started = true;
	state.props = props;
	await new Promise<void>((resolve) => {
		state.release = resolve;
	});
	state.completed = true;
}

export default function PreloadPage() {
	return null;
}
