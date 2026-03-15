export type EcoNavigationOwner = 'none' | 'browser-router' | 'react-router' | (string & {});

export const ECO_DOCUMENT_OWNER_ATTRIBUTE = 'data-eco-document-owner';

export type EcoNavigationDirection = 'forward' | 'back' | 'replace';

export type EcoNavigationRequest = {
	href: string;
	direction?: EcoNavigationDirection;
	source?: EcoNavigationOwner;
};

export type EcoReloadRequest = {
	clearCache?: boolean;
	source?: EcoNavigationOwner;
};

export type EcoNavigationOwnerState = {
	owner: EcoNavigationOwner;
	canHandleSpaNavigation: boolean;
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
	reloadCurrentPage?: (request?: EcoReloadRequest) => Promise<void>;
	cleanupBeforeHandoff?: () => void | Promise<void>;
};

export interface EcoNavigationRuntime {
	getOwnerState(): EcoNavigationOwnerState;
	setOwner(owner: EcoNavigationOwner): void;
	claimOwnership(owner: EcoNavigationOwner): void;
	releaseOwnership(owner: EcoNavigationOwner): void;
	resolveDocumentOwner(doc: Document, fallbackOwner?: EcoNavigationOwner): EcoNavigationOwner;
	adoptDocumentOwner(doc: Document, fallbackOwner?: EcoNavigationOwner): EcoNavigationOwner;
	isOwnedByAnotherRuntime(owner: EcoNavigationOwner): boolean;
	subscribe(listener: EcoNavigationRuntimeListener): () => void;
	register(runtime: EcoNavigationRuntimeRegistration): () => void;
	requestNavigation(request: EcoNavigationRequest): Promise<boolean>;
	reloadCurrentPage(request?: EcoReloadRequest): Promise<boolean>;
	cleanupOwner(owner: EcoNavigationOwner): Promise<void>;
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
		__ecopages_navigation__?: EcoNavigationRuntime;
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

	const runtime: EcoNavigationRuntime = {
		getOwnerState(): EcoNavigationOwnerState {
			const activeRuntime = registrations.get(owner);
			return {
				owner,
				canHandleSpaNavigation: typeof activeRuntime?.navigate === 'function',
			};
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
 */
export function getEcoNavigationRuntime(windowObject: Window & typeof globalThis = window): EcoNavigationRuntime {
	const runtimeWindow = windowObject as EcoNavigationWindow;
	if (!runtimeWindow.__ecopages_navigation__) {
		runtimeWindow.__ecopages_navigation__ = createEcoNavigationRuntime(runtimeWindow);
	}

	return runtimeWindow.__ecopages_navigation__;
}
