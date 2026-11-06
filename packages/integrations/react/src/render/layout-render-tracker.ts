import type { EcoComponent } from '@ecopages/core';
import { LayoutChildrenNotRenderedError } from '@ecopages/core/integration';
import type { FunctionComponent } from 'react';

/**
 * Records the layout tiers and the page a React render reaches.
 *
 * @remarks
 * A tier is wrapped in a function that records it and then calls the tier directly, so the tree keeps its
 * depth and `useId` values match the browser's. Use it for server renders only.
 */
export class LayoutRenderTracker {
	private readonly renderedLayouts = new Map<number, EcoComponent>();
	private pageRendered = false;

	trackLayout(
		component: FunctionComponent<Record<string, unknown>>,
		index: number,
	): FunctionComponent<Record<string, unknown>> {
		return (props) => {
			this.renderedLayouts.set(index, component as EcoComponent);
			return component(props);
		};
	}

	trackPage<P extends Record<string, unknown>>(Page: FunctionComponent<P>): FunctionComponent<P> {
		return (props) => {
			this.pageRendered = true;
			return Page(props);
		};
	}

	/**
	 * Returns the error for the innermost rendered layout when the page did not render.
	 */
	findLayoutWithoutChildren(page: EcoComponent): LayoutChildrenNotRenderedError | undefined {
		if (this.pageRendered || this.renderedLayouts.size === 0) return undefined;
		const innermost = Math.max(...this.renderedLayouts.keys());
		return LayoutChildrenNotRenderedError.forLayout(this.renderedLayouts.get(innermost)!, page);
	}
}
