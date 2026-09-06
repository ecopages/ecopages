import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { cx } from '@/lib/cx';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
	prose?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
	},

	render: ({ children, class: className, prose = false }) => {
		return (
			<body>
				<div class="layout-container">
					<header class="site-header">
						<div class="header-content">
							<a href="/" class="logo">
								EcoBlog
							</a>
							<div class="header-actions">
								<RuiButton href="/about" variant="ghost" size="md">
									About
								</RuiButton>
								<RuiButton href="/rss.xml" variant="ghost" size="md">
									RSS
								</RuiButton>
								<ThemeToggle />
							</div>
						</div>
					</header>
					<main class={cx('main-content', prose && 'prose', className)}>{children}</main>
					<footer class="site-footer">
						<p>{`© ${new Date().getFullYear()} EcoBlog. Built with EcoPages.`}</p>
						<RuiButton
							href="https://github.com/ecopages/ecopages"
							target="_blank"
							rel="noopener noreferrer"
							variant="ghost"
							size="md"
						>
							GitHub
						</RuiButton>
					</footer>
				</div>
			</body>
		);
	},
});
