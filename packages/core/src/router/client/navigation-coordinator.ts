/**
 * Shared browser-side navigation coordinator.
 *
 * This module is the client runtime contract used by browser-router,
 * react-router, and HMR code to coordinate ownership, cross-runtime handoff,
 * current-page reloads, and stale-navigation cancellation.
 *
 * The coordinator stays framework-agnostic: browser runtimes register their
 * capabilities here, and the coordinator arbitrates which runtime currently
 * owns the document and which navigation transaction is still current.
 *
 * @module
 */

/** Logical owner name for a browser navigation runtime. */
export type EcoNavigationOwner = 'none' | 'browser-router' | 'react-router' | (string & {});

/** HTML attribute used to persist the rendered document owner across navigations. */
export const ECO_DOCUMENT_OWNER_ATTRIBUTE = 'data-eco-document-owner';

/** High-level navigation direction understood by browser runtimes. */
export type EcoNavigationDirection = 'forward' | 'back' | 'replace';

/** Navigation request sent between browser runtimes. */
export type EcoNavigationRequest = {
	href: string;
	direction?: EcoNavigationDirection;
	source?: EcoNavigationOwner;
};

/** Navigation handoff request that includes a pre-fetched document. */
export type EcoNavigationHandoffRequest = EcoNavigationRequest & {
	finalHref?: string;
	targetOwner: EcoNavigationOwner;
	document: Document;
	html?: string;
	/**
	 * Reports whether the source runtime's original navigation has already been
	 * superseded.
	 *
	 * Target runtimes use this to ignore handoff work that arrives after a newer
	 * navigation has already claimed ownership.
	 */
	isStaleSourceNavigation?: () => boolean;
};

/** Request to reload the current page through the active runtime. */
export type EcoReloadRequest = {
	clearCache?: boolean;
	source?: EcoNavigationOwner;
};

/** Snapshot of the coordinator's current runtime ownership state. */
export type EcoNavigationOwnerState = {
	owner: EcoNavigationOwner;
	canHandleSpaNavigation: boolean;
};

/**
 * Coordinator-managed navigation transaction.
 *
 * Runtimes use this to determine whether async work has become stale and to
 * cancel or complete the active navigation sequence.
 */
export type EcoNavigationTransaction = {
	id: number;
	signal: AbortSignal;
	isCurrent: () => boolean;
	cancel: () => void;
	complete: () => void;
};

export type EcoNavigationRuntimeEvent =
	| {
			type: 'owner-change';
			owner: EcoNavigationOwner;
			previousOwner: EcoNavigationOwner;
			reason: 'set' | 'claim' | 'release' | 'document' | 'unregister';
	  }
	| {
			type: 'registration-change';
			owner: EcoNavigationOwner;
			status: 'registered' | 'unregistered';
	  };

export type EcoNavigationRuntimeListener = (event: EcoNavigationRuntimeEvent) => void;

export type EcoNavigationRuntimeRegistration = {
	owner: EcoNavigationOwner;
	navigate?: (request: EcoNavigationRequest) => Promise<boolean | void>;
	handoffNavigation?: (request: EcoNavigationHandoffRequest) => Promise<boolean | void>;
	reloadCurrentPage?: (request?: EcoReloadRequest) => Promise<void>;
	/**
	 * Releases runtime-owned client state before another runtime commits a new
	 * document.
	 *
	 * This hook intentionally does not run as part of `requestHandoff()`. The
	 * accepting runtime decides when cleanup is safe so cross-runtime handoffs do
	 * not blank the current page before the incoming document is ready.
	 */
	cleanupBeforeHandoff?: () => void | Promise<void>;
};

/** Public browser-side navigation coordinator interface. */
export interface EcoNavigationRuntime {
	/** Returns the currently active runtime owner and whether it can handle SPA navigation. */
	getOwnerState(): EcoNavigationOwnerState;
	/** Starts a new navigation transaction, invalidating the previously active one. */
	beginNavigationTransaction(): EcoNavigationTransaction;
	/** Reports whether a navigation transaction is still in flight. */
	hasPendingNavigationTransaction(): boolean;
	/** Cancels the active navigation transaction, if one exists. */
	cancelCurrentNavigationTransaction(): void;
	/** Forces the current owner value without checking registrations. */
	setOwner(owner: EcoNavigationOwner): void;
	/** Claims ownership for a runtime that is ready to drive SPA navigation. */
	claimOwnership(owner: EcoNavigationOwner): void;
	/** Releases ownership when the given runtime no longer controls the document. */
	releaseOwnership(owner: EcoNavigationOwner): void;
	/** Resolves document ownership from the rendered owner marker or fallback. */
	resolveDocumentOwner(doc: Document, fallbackOwner?: EcoNavigationOwner): EcoNavigationOwner;
	/** Reads and adopts the rendered document owner as the active runtime owner. */
	adoptDocumentOwner(doc: Document, fallbackOwner?: EcoNavigationOwner): EcoNavigationOwner;
	/** Returns whether the active owner is some runtime other than the given owner. */
	isOwnedByAnotherRuntime(owner: EcoNavigationOwner): boolean;
	/** Subscribes to ownership and registration change events. */
	subscribe(listener: EcoNavigationRuntimeListener): () => void;
	/** Registers a runtime implementation with the coordinator. */
	register(runtime: EcoNavigationRuntimeRegistration): () => void;
	/** Requests navigation through another eligible registered runtime. */
	requestNavigation(request: EcoNavigationRequest): Promise<boolean>;
	/**
	 * Hands a pre-fetched document to the target runtime.
	 *
	 * The coordinator delegates the document but does not clean up the current
	 * owner first. Cleanup timing belongs to the accepting runtime so a stale or
	 * superseded handoff cannot tear down the current page prematurely.
	 */
	requestHandoff(request: EcoNavigationHandoffRequest): Promise<boolean>;
	/** Requests the active runtime to reload the current page. */
	reloadCurrentPage(request?: EcoReloadRequest): Promise<boolean>;
	/** Runs a target runtime's cleanup hook before handoff. */
	cleanupOwner(owner: EcoNavigationOwner): Promise<void>;
	/** Runs cleanup for whichever runtime currently owns the document. */
	cleanupCurrentOwner(): Promise<void>;
}

/**
 * Reads the explicit browser document owner marker from a rendered HTML document.
 *
 * Documents without a marker return `null`, allowing runtimes to fall back to
 * their local default behavior without scanning hydration scripts.
 */
export function getEcoDocumentOwner(doc: Document): EcoNavigationOwner | null {
	const owner = doc.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
	return owner && owner.length > 0 ? (owner as EcoNavigationOwner) : null;
}

type EcoNavigationWindow = Window &
	typeof globalThis & {
		__ECO_PAGES__?: {
			navigation?: EcoNavigationRuntime;
		};
	};

function getCandidateOwners(
	currentOwner: EcoNavigationOwner,
	registrations: Map<EcoNavigationOwner, EcoNavigationRuntimeRegistration>,
	excludedOwner?: EcoNavigationOwner,
): EcoNavigationOwner[] {
	const owners: EcoNavigationOwner[] = [];

	if (currentOwner !== 'none' && currentOwner !== excludedOwner) {
		owners.push(currentOwner);
	}

	for (const owner of registrations.keys()) {
		if (owner === currentOwner || owner === excludedOwner) {
			continue;
		}

		owners.push(owner);
	}

	return owners;
}

function createEcoNavigationRuntime(_windowObject: EcoNavigationWindow): EcoNavigationRuntime {
	const registrations = new Map<EcoNavigationOwner, EcoNavigationRuntimeRegistration>();
	const listeners = new Set<EcoNavigationRuntimeListener>();
	let owner: EcoNavigationOwner = 'none';
	let navigationSequence = 0;
	let navigationAbortController: AbortController | null = null;

	const emit = (event: EcoNavigationRuntimeEvent) => {
		for (const listener of listeners) {
			listener(event);
		}
	};

	const updateOwner = (
		nextOwner: EcoNavigationOwner,
		reason: Extract<EcoNavigationRuntimeEvent, { type: 'owner-change' }>['reason'],
	) => {
		if (owner === nextOwner) {
			return;
		}

		const previousOwner = owner;
		owner = nextOwner;
		emit({
			type: 'owner-change',
			owner: nextOwner,
			previousOwner,
			reason,
		});
	};

	const cancelNavigationTransaction = (navigationId: number, abortController: AbortController): void => {
		if (navigationSequence !== navigationId || navigationAbortController !== abortController) {
			return;
		}

		navigationSequence += 1;
		navigationAbortController = null;
		abortController.abort();
	};

	const completeNavigationTransaction = (navigationId: number, abortController: AbortController): void => {
		if (navigationSequence !== navigationId || navigationAbortController !== abortController) {
			return;
		}

		navigationAbortController = null;
	};

	const runtime: EcoNavigationRuntime = {
		getOwnerState(): EcoNavigationOwnerState {
			const activeRuntime = registrations.get(owner);
			return {
				owner,
				canHandleSpaNavigation: typeof activeRuntime?.navigate === 'function',
			};
		},

		hasPendingNavigationTransaction(): boolean {
			return navigationAbortController !== null;
		},

		beginNavigationTransaction(): EcoNavigationTransaction {
			navigationAbortController?.abort();
			const abortController = new AbortController();
			const navigationId = ++navigationSequence;
			navigationAbortController = abortController;

			return {
				id: navigationId,
				signal: abortController.signal,
				isCurrent: () => navigationSequence === navigationId && navigationAbortController === abortController,
				cancel: () => {
					cancelNavigationTransaction(navigationId, abortController);
				},
				complete: () => {
					completeNavigationTransaction(navigationId, abortController);
				},
			};
		},

		cancelCurrentNavigationTransaction(): void {
			if (!navigationAbortController) {
				return;
			}

			cancelNavigationTransaction(navigationSequence, navigationAbortController);
		},

		setOwner(nextOwner: EcoNavigationOwner): void {
			updateOwner(nextOwner, 'set');
		},

		claimOwnership(nextOwner: EcoNavigationOwner): void {
			updateOwner(nextOwner, 'claim');
		},

		releaseOwnership(currentOwner: EcoNavigationOwner): void {
			if (owner !== currentOwner) {
				return;
			}

			updateOwner('none', 'release');
		},

		resolveDocumentOwner(doc: Document, fallbackOwner: EcoNavigationOwner = 'none'): EcoNavigationOwner {
			return getEcoDocumentOwner(doc) ?? fallbackOwner;
		},

		adoptDocumentOwner(doc: Document, fallbackOwner: EcoNavigationOwner = 'none'): EcoNavigationOwner {
			const nextOwner = runtime.resolveDocumentOwner(doc, fallbackOwner);
			updateOwner(nextOwner, 'document');
			return nextOwner;
		},

		isOwnedByAnotherRuntime(candidateOwner: EcoNavigationOwner): boolean {
			return owner !== 'none' && owner !== candidateOwner;
		},

		subscribe(listener: EcoNavigationRuntimeListener): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		register(registration: EcoNavigationRuntimeRegistration): () => void {
			registrations.set(registration.owner, registration);
			emit({
				type: 'registration-change',
				owner: registration.owner,
				status: 'registered',
			});

			return () => {
				const currentRegistration = registrations.get(registration.owner);
				if (currentRegistration !== registration) {
					return;
				}

				registrations.delete(registration.owner);
				emit({
					type: 'registration-change',
					owner: registration.owner,
					status: 'unregistered',
				});
				if (owner === registration.owner) {
					updateOwner('none', 'unregister');
				}
			};
		},

		async requestNavigation(request: EcoNavigationRequest): Promise<boolean> {
			for (const candidateOwner of getCandidateOwners(owner, registrations, request.source)) {
				const registration = registrations.get(candidateOwner);
				if (!registration?.navigate) {
					continue;
				}

				const handled = await registration.navigate(request);
				if (handled !== false) {
					return true;
				}
			}

			return false;
		},

		async requestHandoff(request: EcoNavigationHandoffRequest): Promise<boolean> {
			if (request.targetOwner === 'none') {
				return false;
			}

			if (request.isStaleSourceNavigation?.()) {
				return true;
			}

			const registration = registrations.get(request.targetOwner);
			if (!registration?.handoffNavigation) {
				return false;
			}

			if (request.isStaleSourceNavigation?.()) {
				return true;
			}

			const handled = await registration.handoffNavigation(request);
			return handled !== false;
		},

		async reloadCurrentPage(request?: EcoReloadRequest): Promise<boolean> {
			for (const candidateOwner of getCandidateOwners(owner, registrations)) {
				const registration = registrations.get(candidateOwner);
				if (!registration?.reloadCurrentPage) {
					continue;
				}

				await registration.reloadCurrentPage(request);
				return true;
			}

			return false;
		},

		async cleanupOwner(targetOwner: EcoNavigationOwner): Promise<void> {
			if (targetOwner === 'none') {
				return;
			}

			const registration = registrations.get(targetOwner);
			if (!registration?.cleanupBeforeHandoff) {
				return;
			}

			await registration.cleanupBeforeHandoff();
			if (owner === targetOwner) {
				updateOwner('none', 'release');
			}
		},

		async cleanupCurrentOwner(): Promise<void> {
			await runtime.cleanupOwner(owner);
		},
	};

	return runtime;
}

/**
 * Returns the singleton browser-side navigation coordinator.
 *
 * The coordinator centralizes ownership, handoff, and current-page reload
 * requests across browser runtimes through one internal protocol.
 *
 * @param windowObject - Window-like object that stores the singleton runtime.
 * @returns The shared browser navigation coordinator.
 */
export function getEcoNavigationRuntime(windowObject: Window & typeof globalThis = window): EcoNavigationRuntime {
	const runtimeWindow = windowObject as EcoNavigationWindow;
	runtimeWindow.__ECO_PAGES__ = runtimeWindow.__ECO_PAGES__ || {};
	if (!runtimeWindow.__ECO_PAGES__.navigation) {
		runtimeWindow.__ECO_PAGES__.navigation = createEcoNavigationRuntime(runtimeWindow);
	}

	return runtimeWindow.__ECO_PAGES__.navigation;
}
