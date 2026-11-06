import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Logo } from '@/components/logo/logo';
import '../../styles/tailwind.css';
import './base-layout.css';

export interface BaseLayoutProps extends LayoutProps<JsxRenderable> {
	class?: string;
	/** When `false`, the caller owns the page chrome. */
	showHeader?: boolean;
}

export function BaseLayout({ children, class: className, showHeader = true }: BaseLayoutProps) {
	if (!showHeader) {
		return children;
	}

	return (
		<>
			<header class="site-header">
				<Logo>Wiki</Logo>
			</header>
			<main class={className}>{children}</main>
		</>
	);
}

export default BaseLayout;
