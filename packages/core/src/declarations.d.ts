import type { EcoPagesAppConfig } from './internal-types';
import type { EcoNavigationRuntime } from './router/client/navigation-coordinator';

type HMRHandler = (url: string) => Promise<void>;
type CleanupPageRootFunction = () => void;
type EcoPageRoot = { render: (node: unknown) => void; unmount: () => void };
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
	page?: EcoPageData;
};

declare global {
	interface Window {
		/** Shared Ecopages browser runtime state */
		__ECO_PAGES__?: EcoPagesWindowRuntime;
	}
}

declare module '*.css' {
	const styles: string;
	export default styles;
}
