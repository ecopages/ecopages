import type { EcoPagesAppConfig } from './internal-types';

type HMRHandler = (url: string) => Promise<void>;

type ReloadPageFunction = (options: { clearCache: boolean }) => Promise<void>;

declare global {
	var ecoConfig: EcoPagesAppConfig;

	interface Window {
		/** Registered HMR handlers for specific module paths */
		__ecopages_hmr_handlers__?: Record<string, HMRHandler>;
		/** Function to reload the current page, used for layout updates */
		__ecopages_reload_current_page__?: ReloadPageFunction;
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

declare module '*.mdx' {
	let MDXComponent: (props: any) => JSX.Element;
	export default MDXComponent;
}
