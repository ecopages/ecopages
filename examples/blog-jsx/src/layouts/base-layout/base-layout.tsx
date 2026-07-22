import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ThemeToggle } from '@/components/theme-toggle';

export type BaseLayoutProps = {
	children: JsxRenderable;
	id?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [ThemeToggle],
	},

	render: ({ children }) => {
		return (
			<body>
				<div class="layout-container">
					<header class="site-header">
						<div class="header-content">
							<a href="/" class="logo">
								EcoBlog
							</a>
							<ThemeToggle />
						</div>
					</header>
					<main class="main-content">{children}</main>
					<footer class="site-footer">
						<p>{`© ${new Date().getFullYear()} EcoBlog. Built with EcoPages.`}</p>
						<a
							href="https://github.com/ecopages/ecopages"
							target="_blank"
							rel="noopener noreferrer"
							class="footer-link"
						>
							GitHub
						</a>
					</footer>
				</div>
			</body>
		);
	},
});
