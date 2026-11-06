/** @jsxImportSource @ecopages/jsx */
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export function JsxLayout({ children }: LayoutProps<JsxRenderable>) {
	return <div data-layout="jsx">{children}</div>;
}
