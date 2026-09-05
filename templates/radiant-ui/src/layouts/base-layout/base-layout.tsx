import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo/logo';
import { NavigationHeader } from '@/components/blocks/navigation-header';
import { Footer } from '@/components/blocks/footer';
import { Button } from '@/components/ui/button';
import { site } from '@/site.config';
import { cx } from '@/lib/cx';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
	/** Applies prose styles to the main region, for Markdown-driven pages. */
	prose?: boolean;
	/**
	 * Route of the page being rendered, so the header can mark the current link.
	 * Blocks lay out their own bands, so pages built from them pass no padding.
	 */
	currentPath?: string;
	/**
	 * Blocks are full-width bands and manage their own measure. Set this on
	 * pages that are plain content and want the layout's centred column.
	 */
	contained?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [Logo, ThemeToggle, NavigationHeader, Footer, Button],
	},

	render: ({ children, class: className, prose = false, currentPath, contained = false }) => (
		<body>
			<NavigationHeader
				sticky
				brand={<Logo title={site.name}>{site.name}</Logo>}
				links={site.nav.map((link) => ({ ...link, current: link.href === currentPath }))}
				actions={<ThemeToggle />}
			/>
			<main class={cx('layout-main', contained && 'layout-main--contained', prose && 'prose', className)}>
				{children}
			</main>
			<Footer
				brand={<Logo title={site.name}>{site.name}</Logo>}
				description={site.description}
				columns={site.footer.columns}
				legal={site.footer.legal}
			/>
		</body>
	),
});
