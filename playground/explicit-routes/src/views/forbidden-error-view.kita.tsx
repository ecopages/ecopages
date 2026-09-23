import { eco } from '@ecopages/core';
import type { Error403TemplateProps } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';

export const ForbiddenView = eco.page<Error403TemplateProps>({
	layout: MainLayout,
	metadata: () => ({
		title: 'Forbidden | Explicit Routes',
	}),
	render: ({ message }) => {
		return (
			<div class="error403 text-center py-16">
				<p class="text-6xl font-serif font-bold text-accent mb-4" aria-hidden="true">
					403
				</p>
				<h1 class="text-2xl font-bold mb-2">Forbidden</h1>
				<p class="text-text-muted mb-8 max-w-md mx-auto">
					{message ?? 'You do not have permission to access this page.'}
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

export default ForbiddenView;
