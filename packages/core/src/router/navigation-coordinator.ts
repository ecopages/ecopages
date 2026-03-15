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

export type EcoNavigationRuntimeRegistration = {
	owner: EcoNavigationOwner;
	navigate?: (request: EcoNavigationRequest) => Promise<boolean | void>;
	reloadCurrentPage?: (request?: EcoReloadRequest) => Promise<void>;
	cleanupBeforeHandoff?: () => void | Promise<void>;
};

export interface EcoNavigationRuntime {
	getOwnerState(): EcoNavigationOwnerState;
	setOwner(owner: EcoNavigationOwner): void;
	register(runtime: EcoNavigationRuntimeRegistration): () => void;
	requestNavigation(request: EcoNavigationRequest): Promise<boolean>;
	reloadCurrentPage(request?: EcoReloadRequest): Promise<boolean>;
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
		__ecopages_cleanup_page_root__?: () => void;
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

function createEcoNavigationRuntime(windowObject: EcoNavigationWindow): EcoNavigationRuntime {
	const registrations = new Map<EcoNavigationOwner, EcoNavigationRuntimeRegistration>();
	let owner: EcoNavigationOwner = 'none';

	const runtime: EcoNavigationRuntime = {
		getOwnerState(): EcoNavigationOwnerState {
			const activeRuntime = registrations.get(owner);
			return {
				owner,
				canHandleSpaNavigation: typeof activeRuntime?.navigate === 'function',
			};
		},

		setOwner(nextOwner: EcoNavigationOwner): void {
			owner = nextOwner;
		},

		register(registration: EcoNavigationRuntimeRegistration): () => void {
			registrations.set(registration.owner, registration);

			return () => {
				const currentRegistration = registrations.get(registration.owner);
				if (currentRegistration !== registration) {
					return;
				}

				registrations.delete(registration.owner);
				if (owner === registration.owner) {
					owner = 'none';
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

		async cleanupCurrentOwner(): Promise<void> {
			const registration = registrations.get(owner);
			if (registration?.cleanupBeforeHandoff) {
				await registration.cleanupBeforeHandoff();
				return;
			}

			if (owner === 'react-router') {
				windowObject.__ecopages_cleanup_page_root__?.();
			}
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