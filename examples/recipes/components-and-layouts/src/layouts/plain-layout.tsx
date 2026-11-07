import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/** A layout with nothing to declare is a plain function. It must render `children`. */
export function PlainLayout({ children }: LayoutProps<JsxRenderable>) {
	return (
		<div data-layout="plain">
			<header>Plain layout</header>
			{children}
		</div>
	);
}
