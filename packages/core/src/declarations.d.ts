import './css-imports.d.ts';

import type { EcoPagesAppConfig } from './types/internal-types';
import type { EcoNavigationRuntime } from './router/client/navigation-coordinator';

type HMRHandler = (url: string) => Promise<void>;
type CleanupPageRootFunction = () => void;
type EcoPageRoot = { render: (node: unknown) => void; unmount: () => void };
type EcoIslandComponent = (props: Record<string, unknown>) => unknown;
/** Shared React island diagnostics and root lookup state exposed to devtools. */
type EcoIslandRuntime = {
	islandRoots: Record<string, EcoPageRoot>;
	islandComponents: Record<string, EcoIslandComponent>;
};
type EcoPageData = {
	module: string;
	props: Record<string, unknown>;
};
type EcoPagesWindowRuntime = {
	hmrHandlers?: Record<string, HMRHandler>;
	navigation?: EcoNavigationRuntime;
	react?: {
		cleanupPageRoot?: CleanupPageRootFunction;
		pageRoot?: EcoPageRoot | null;
	};
	/** Roots keyed by SSR instance ID; component keys are never used for lookup. */
	islandRoots?: Record<string, EcoPageRoot>;
	islandComponents?: Record<string, EcoIslandComponent>;
	__ecoIslandRuntime?: EcoIslandRuntime;
	page?: EcoPageData;
};

declare global {
	interface Window {
		/** Shared Ecopages browser runtime state */
		__ECO_PAGES__?: EcoPagesWindowRuntime;
	}
}
