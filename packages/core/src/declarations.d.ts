import type { EcoPagesAppConfig } from './internal-types';
import type {
	EcoNavigationRuntime,
} from './router/navigation-coordinator';

type HMRHandler = (url: string) => Promise<void>;
type CleanupPageRootFunction = () => void;

declare global {
	var ecoConfig: EcoPagesAppConfig;

	interface Window {
		/** Registered HMR handlers for specific module paths */
		__ecopages_hmr_handlers__?: Record<string, HMRHandler>;
		/** Shared navigation coordinator used by browser runtimes */
		__ecopages_navigation__?: EcoNavigationRuntime;
		/** Cleanup hook for the current React page root before handing off navigation */
		__ecopages_cleanup_page_root__?: CleanupPageRootFunction;
		/** Active React page root instance used by page-level hydration */
		__ecopages_page_root__?: { render: (node: unknown) => void; unmount: () => void } | null;
		/** Page data registry - contains module path and props for current page */
		__ECO_PAGE__?: {
			module: string;
			props: Record<string, unknown>;
		};
	}
}

declare module '*.css' {
	const styles: string;
	export default styles;
}
