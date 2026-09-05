/**
 * AppLayout — a viewport shell without marketing chrome.
 *
 * Dashboard-style pages need the sidebar to own the frame. The marketing header
 * and footer would nest an application inside a site, so this layout is just
 * the document body and a full-height main.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';

export type AppLayoutProps = {
	children: JsxRenderable;
	class?: string;
};

export const AppLayout = eco.component<AppLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./app-layout.css'],
		scripts: ['../base-layout/base-layout.script.ts'],
	},
	render: ({ children, class: className }) => (
		<body class={cx('app-layout', className)}>{children}</body>
	),
});
