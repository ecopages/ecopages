import { eco } from '@ecopages/core';
import type { Error404TemplateProps } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';

export const NotFoundView = eco.page<Error404TemplateProps>({
	layout: MainLayout,
	metadata: () => ({
		title: 'Not Found | Explicit Routes',
	}),
	render: () => {
		return (
			<div class="error404 text-center py-16">
				<p class="text-6xl font-serif font-bold text-accent mb-4" aria-hidden="true">
					404
				</p>
				<h1 class="text-2xl font-bold mb-2">Page not found</h1>
				<p class="text-text-muted mb-8 max-w-md mx-auto">
					The page you requested does not exist. Try the post list or API routes from the header.
				</p>
				<a
					href="/"
					class="inline-block px-4 py-2 rounded-lg border border-border bg-surface-elevated hover:text-accent transition-colors"
				>
					Back to home
				</a>
			</div>
		);
	},
});

export default NotFoundView;
