import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import { MainLayout } from '@/layouts/main-layout.kita';

function buildCopyPayload(message: string | undefined, stack: string | undefined): string {
	return [message ? `Message: ${message}` : '', stack ? `Stack:\n${stack}` : ''].filter(Boolean).join('\n\n');
}

export const ServerErrorView = eco.page<Error500TemplateProps>({
	layout: MainLayout,
	metadata: () => ({
		title: 'Server Error | Explicit Routes',
	}),
	render: ({ message, stack }) => {
		const copyPayload = buildCopyPayload(message, stack);
		const showCopy = Boolean(copyPayload);

		return (
			<div class="error500 text-center py-16">
				<p class="text-6xl font-serif font-bold text-accent mb-4" aria-hidden="true">
					500
				</p>
				<h1 class="text-2xl font-bold mb-2">Something went wrong</h1>
				<p class="text-text-muted mb-4 max-w-md mx-auto">
					{message ?? 'An unexpected error occurred while rendering this page.'}
				</p>
				{stack ? (
					<pre class="error500__stack text-left text-sm bg-surface-elevated border border-border rounded-lg p-4 max-w-2xl mx-auto mb-6 overflow-x-auto whitespace-pre-wrap">
						{stack}
					</pre>
				) : null}
				<div class="error500__actions flex flex-wrap gap-3 justify-center">
					{showCopy ? (
						<button
							type="button"
							class="px-4 py-2 rounded-lg border border-border bg-surface-elevated hover:text-accent transition-colors"
							onclick={`navigator.clipboard?.writeText(${JSON.stringify(copyPayload)})`}
						>
							Copy error
						</button>
					) : null}
					<a
						href="/"
						class="inline-block px-4 py-2 rounded-lg border border-border bg-surface-elevated hover:text-accent transition-colors"
					>
						Back to home
					</a>
				</div>
			</div>
		);
	},
});

export default ServerErrorView;
