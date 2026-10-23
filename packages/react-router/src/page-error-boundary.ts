import { Component, type ReactNode } from 'react';

type PageErrorBoundaryProps = {
	/** Whether a router navigation has committed a Page since the router mounted. */
	hasNavigated: () => boolean;
	/** Reloads the document at the current URL. */
	reloadDocument: () => void;
	children?: ReactNode;
};

type PageErrorBoundaryState = {
	caught: boolean;
	error: unknown;
};

/**
 * Turns a render error after a router navigation into a full document navigation.
 *
 * @remarks
 * A navigation commits the next Page inside a React transition, so a lazy
 * component whose chunk fails to load, or any other error thrown while the next
 * Page renders, would otherwise unmount the whole root and leave the document
 * empty at the new URL. The URL is already the destination, so reloading it
 * renders the Page on the server, as the router already does when a page
 * module fails to load. Coordinator and HMR reloads count as navigations.
 * Once a navigation has committed, a later render error in the Page on screen
 * reloads the same way, and client state in that document is lost. When the
 * reload is cancelled, for example by a `beforeunload` prompt, the boundary
 * keeps rendering nothing.
 *
 * The document is replaced, so the next router starts without a committed
 * navigation and cannot reload again; within one document the boundary keeps
 * rendering nothing after its first error, so it reloads once. An error before
 * any navigation has committed, such as a failing lazy chunk while the first
 * Page hydrates, is rethrown so page hydration can keep the server HTML:
 * reloading there would loop for as long as the failure lasts.
 */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
	override state: PageErrorBoundaryState = { caught: false, error: undefined };

	static getDerivedStateFromError(error: unknown): PageErrorBoundaryState {
		return { caught: true, error };
	}

	override componentDidCatch(error: unknown): void {
		console.error('[EcoRouter] Rendering the page failed, falling back to a full navigation:', error);
		this.props.reloadDocument();
	}

	override render(): ReactNode {
		if (!this.state.caught) {
			return this.props.children;
		}
		if (!this.props.hasNavigated()) {
			throw this.state.error;
		}
		return null;
	}
}
