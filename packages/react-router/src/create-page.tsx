/**
 * Utility for creating page components with automatic router and layout wrapping.
 * @module
 */

import type { EcoComponent, EcoComponentDependencies } from '@ecopages/core';
import type { ComponentType, JSX, ReactNode } from 'react';
import { EcoReactRouter } from './router';

export type WrapperFn = (children: ReactNode) => JSX.Element;

export type PageConfig = {
	dependencies?: EcoComponentDependencies;
};

type PageComponent<P> = EcoComponent<P, JSX.Element> & {
	Content: ComponentType<P>;
};

/**
 * Creates a page component wrapped with EcoReactRouter.
 *
 * The returned component automatically includes a `.Content` property
 * for SPA navigation - no need to manually export `Content`.
 *
 * @example
 * ```tsx
 * // Without wrapper (router-only)
 * export default createPage(MyContent);
 *
 * // With dependencies only
 * export default createPage(MyContent, { dependencies: { stylesheets: ['./page.css'] } });
 *
 * // With wrapper function
 * export default createPage(MyContent, (children) => (
 *   <BaseLayout className="dark">
 *     {children}
 *   </BaseLayout>
 * ));
 *
 * // With wrapper and explicit dependencies for asset collection
 * export default createPage(
 *   MyContent,
 *   (children) => <BaseLayout>{children}</BaseLayout>,
 *   { dependencies: { components: [BaseLayout] } }
 * );
 * ```
 */
export function createPage<P extends Record<string, unknown>>(
	ContentComponent: ComponentType<P>,
	wrapperOrConfig?: WrapperFn | PageConfig,
	config?: PageConfig,
): PageComponent<P> {
	const wrapper = typeof wrapperOrConfig === 'function' ? wrapperOrConfig : undefined;
	const resolvedConfig = typeof wrapperOrConfig === 'function' ? config : wrapperOrConfig;
	const { dependencies } = resolvedConfig ?? {};

	const Page = ((props: P) => {
		return (
			<EcoReactRouter initialComponent={ContentComponent} initialProps={props}>
				{({ Component, props: pageProps }) => {
					const content = <Component {...pageProps} />;
					return wrapper ? wrapper(content) : content;
				}}
			</EcoReactRouter>
		);
	}) as PageComponent<P>;

	Page.Content = ContentComponent;
	Page.config = { dependencies };

	return Page;
}
