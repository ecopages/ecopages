import type { EcoPagesElement, LayoutProps } from '@ecopages/core';
import '../styles/tailwind.css';

export type MainLayoutProps = LayoutProps<EcoPagesElement>;

export function MainLayout({ children }: MainLayoutProps) {
	return (
		<div class="layout-container min-h-screen bg-surface text-text font-sans">
			<header class="site-header border-b border-border p-4 bg-surface-elevated">
				<div class="header-content max-w-4xl mx-auto flex justify-between items-center">
					<a href="/" class="logo text-xl font-serif font-bold text-accent">
						Explicit Routes Playground
					</a>
					<nav class="flex gap-4">
						<a href="/posts" class="hover:text-accent">
							Posts
						</a>
						<a href="/api/v1/posts" class="hover:text-accent">
							API
						</a>
					</nav>
				</div>
			</header>
			<main class="main-content max-w-4xl mx-auto p-8">{children}</main>
			<footer class="site-footer border-t border-border mt-12 p-8 text-center text-text-muted">
				<p>{'© ' + new Date().getFullYear()} Explicit Routes Playground.</p>
			</footer>
		</div>
	);
}
