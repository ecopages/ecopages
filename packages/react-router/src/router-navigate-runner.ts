import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import type { EcoNavigationTransaction } from '@ecopages/core/router/navigation-coordinator';
import { applyViewTransitionNames } from '@ecopages/core/client/view-transitions';
import type { Dispatch, MutableRefObject, SetStateAction, TransitionStartFunction } from 'react';
import { morphHead } from './head-morpher.ts';
import type { PageState } from './navigation.ts';
import {
	applyHandoffNavigation,
	applySpaNavigation,
	decideQueuedNavigationReplay,
	resolveReactNavigation,
	type ReactNavigationOutcome,
} from './navigation-orchestrator.ts';
import { saveScrollPositions, restoreScrollPositions } from './scroll-persist.ts';
import type { EcoRouterOptions } from './types.ts';

export type RouterNavigateOptions = {
	isPopState?: boolean;
	pushHistory?: boolean;
	skipViewTransition?: boolean;
	moduleUrlOverride?: string;
};

type RouterPageState = PageState & {
	refreshPersistedLayout?: boolean;
};

type PendingRender = {
	navigationId: number;
	page: PageState;
	resolve: () => void;
};

export type RouterNavigateRunnerDeps = {
	options: EcoRouterOptions;
	pendingRenderRef: MutableRefObject<PendingRender | null>;
	activeNavigationRef: MutableRefObject<EcoNavigationTransaction | null>;
	isNavigatingRef: MutableRefObject<boolean>;
	runtimeActiveRef: MutableRefObject<boolean>;
	queuedNavigationHrefRef: MutableRefObject<string | null>;
	committedPathRef: MutableRefObject<string>;
	setIsNavigating: Dispatch<SetStateAction<boolean>>;
	setCurrentPage: Dispatch<SetStateAction<RouterPageState>>;
	startTransition: TransitionStartFunction;
	replayLocalNavigate: (href: string) => void;
	createDeferred: <T>() => { promise: Promise<T>; resolve: (value: T) => void };
};

function createWaitForRender(
	pendingRenderRef: MutableRefObject<PendingRender | null>,
	navigationId: number,
	createDeferred: RouterNavigateRunnerDeps['createDeferred'],
) {
	return (nextPage: RouterPageState) => {
		pendingRenderRef.current?.resolve();
		const renderDeferred = createDeferred<void>();
		pendingRenderRef.current = {
			navigationId,
			page: nextPage,
			resolve: renderDeferred.resolve,
		};
		return renderDeferred.promise;
	};
}

function createSpaViewTransition(
	deps: RouterNavigateRunnerDeps,
	input: {
		skipViewTransition: boolean;
		isStale: () => boolean;
		navigationId: number;
	},
) {
	if (input.skipViewTransition || !deps.options.viewTransitions || !document.startViewTransition) {
		return undefined;
	}

	return (update: () => Promise<void>) =>
		new Promise<void>((resolve) => {
			document.startViewTransition(async () => {
				try {
					await update();
				} finally {
					if (input.isStale() && deps.pendingRenderRef.current?.navigationId === input.navigationId) {
						deps.pendingRenderRef.current.resolve();
						deps.pendingRenderRef.current = null;
					}
					resolve();
				}
			});
		});
}

async function applyRouterNavigationOutcome(
	outcome: ReactNavigationOutcome,
	input: {
		isStale: () => boolean;
		skipViewTransition: boolean;
		isPopState: boolean;
		navigationId: number;
		navigationRuntime: ReturnType<typeof getEcoNavigationRuntime>;
		deps: RouterNavigateRunnerDeps;
	},
): Promise<void> {
	if (outcome.kind === 'stale') {
		return;
	}

	if (outcome.kind === 'hard-navigation') {
		if (outcome.mode === 'assign') {
			window.location.assign(outcome.href);
		} else {
			window.location.href = outcome.href;
		}
		return;
	}

	if (outcome.kind === 'spa') {
		const waitForRender = createWaitForRender(
			input.deps.pendingRenderRef,
			input.navigationId,
			input.deps.createDeferred,
		);
		await applySpaNavigation(
			outcome,
			{
				isStale: input.isStale,
				hardAssign: (href) => {
					window.location.assign(href);
				},
				morphHead,
				applyViewTransitionNames,
				saveScrollPositions,
				restoreScrollPositions,
				updateHistory: (finalPath, requestedUrl, direction) => {
					if (direction === 'forward') {
						window.history.pushState(null, '', finalPath);
					} else if (finalPath !== requestedUrl) {
						window.history.replaceState(null, '', finalPath);
					}
				},
				commitPageData: (moduleUrl, props) => {
					window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
					window.__ECO_PAGES__.page = {
						module: moduleUrl,
						props,
					};
				},
				setCurrentPage: input.deps.setCurrentPage,
				waitForRender,
				runInReactTransition: (update) => {
					input.deps.startTransition(update);
				},
				startViewTransition: createSpaViewTransition(input.deps, {
					skipViewTransition: input.skipViewTransition,
					isStale: input.isStale,
					navigationId: input.navigationId,
				}),
				onCommittedPath: (finalPath) => {
					input.deps.committedPathRef.current = finalPath;
				},
			},
			{ skipViewTransition: input.skipViewTransition, isPopState: input.isPopState },
		);
		return;
	}

	await applyHandoffNavigation(outcome, {
		isStale: input.isStale,
		requestHandoff: (request) =>
			input.navigationRuntime.requestHandoff({
				...request,
				source: 'react-router',
				targetOwner: 'browser-router',
			}),
		hardAssign: (href) => {
			window.location.assign(href);
		},
	});
}

function finalizeRouterNavigate(input: {
	isStale: () => boolean;
	navigationId: number;
	navigation: EcoNavigationTransaction;
	navigationRuntime: ReturnType<typeof getEcoNavigationRuntime>;
	deps: RouterNavigateRunnerDeps;
}): void {
	const { deps, isStale, navigation, navigationId, navigationRuntime } = input;

	if (!isStale()) {
		deps.isNavigatingRef.current = false;
		deps.setIsNavigating(false);
	}

	const shouldReplayQueuedNavigation = deps.activeNavigationRef.current?.id === navigationId;
	const queuedNavigationHref = shouldReplayQueuedNavigation ? deps.queuedNavigationHrefRef.current : null;
	const replay = decideQueuedNavigationReplay({
		queuedHref: queuedNavigationHref,
		committedPath: deps.committedPathRef.current,
		runtimeActive: deps.runtimeActiveRef.current,
	});

	navigation.complete();
	if (deps.activeNavigationRef.current?.id === navigationId) {
		deps.activeNavigationRef.current = null;
	}

	if (replay.kind === 'none') {
		return;
	}

	deps.queuedNavigationHrefRef.current = null;

	if (replay.kind === 'local-navigate') {
		deps.replayLocalNavigate(replay.href);
		return;
	}

	void navigationRuntime
		.requestNavigation({
			href: replay.href,
			direction: 'forward',
			source: 'react-router',
		})
		.then((handled) => {
			if (!handled) {
				window.location.assign(replay.href);
			}
		});
}

export async function runRouterNavigate(
	url: string,
	navigationOptions: RouterNavigateOptions,
	deps: RouterNavigateRunnerDeps,
): Promise<void> {
	const {
		isPopState = false,
		pushHistory = false,
		skipViewTransition = false,
		moduleUrlOverride,
	} = navigationOptions;
	const navigationRuntime = getEcoNavigationRuntime(window);
	const navigation = navigationRuntime.beginNavigationTransaction();
	deps.activeNavigationRef.current = navigation;
	const navigationId = navigation.id;
	const isStale = () => !navigation.isCurrent();

	try {
		deps.isNavigatingRef.current = true;
		deps.setIsNavigating(true);

		const outcome = await resolveReactNavigation({
			url,
			signal: navigation.signal,
			isStale,
			isPopState,
			pushHistory,
			moduleUrlOverride,
		});

		await applyRouterNavigationOutcome(outcome, {
			isStale,
			skipViewTransition,
			isPopState,
			navigationId,
			navigationRuntime,
			deps,
		});
	} finally {
		finalizeRouterNavigate({
			isStale,
			navigationId,
			navigation,
			navigationRuntime,
			deps,
		});
	}
}
