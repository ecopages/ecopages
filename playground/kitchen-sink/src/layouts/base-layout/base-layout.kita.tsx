import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import { ThemeToggle } from '../../components/theme-toggle.kita';

const primaryLinks = [
	{ href: '/', label: 'Overview' },
	{ href: '/integration-matrix', label: 'Matrix' },
	{ href: '/integration-matrix/lit-entry', label: 'Lit entry' },
	{ href: '/integration-matrix/react-entry', label: 'React entry' },
	{ href: '/images', label: 'Images' },
	{ href: '/patterns/middleware', label: 'Middleware' },
	{ href: '/catalog/semantic-html', label: 'Catalog route' },
	{ href: '/explicit/team', label: 'Explicit route' },
	{ href: '/latest', label: 'ctx.render()' },
	{ href: '/api-lab', label: 'API lab' },
	{ href: '/docs', label: 'MDX' },
	{ href: '/postcss', label: 'PostCSS test' },
];

export const BaseLayout = eco.layout({
	dependencies: {
		components: [ThemeToggle],
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, locals }: LayoutProps) => {
		const requestInfo = locals?.requestInfo;
		const viewerRole = locals?.viewerRole;

		return (
			<div class="min-h-dvh flex flex-col bg-background text-on-background">
				<header class="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
					<div class="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
						<div class="space-y-1">
							<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Kitchen sink</p>
							<h1 class="font-display text-2xl font-semibold tracking-tight">
								Render layers, routes, middleware, and APIs in one app
							</h1>
						</div>
						<div class="flex flex-wrap items-center gap-2 text-sm text-muted">
							{requestInfo ? (
								<span class="badge badge--mono">
									{requestInfo.requestId} {requestInfo.method} {requestInfo.pathname}
								</span>
							) : (
								<span class="badge">Static request context</span>
							)}
							<span class="badge">role: {viewerRole ?? 'viewer'}</span>
							<ThemeToggle />
						</div>
					</div>
					<nav class="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-5 text-sm">
						{primaryLinks.map((link) => (
							<a href={link.href} class="button text-on-background">
								{link.label}
							</a>
						))}
					</nav>
				</header>
				<main class="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
				<footer class="mx-auto flex max-w-6xl flex-col gap-2 px-6 pb-10 text-sm text-muted lg:flex-row lg:items-center lg:justify-between">
					<p>
						File-system pages and explicit handlers share the same shell, layout, and dependency pipeline.
					</p>
					<p>
						Send the <span class="font-mono">x-kitchen-role: admin</span> header to unlock the admin group
						endpoints.
					</p>
				</footer>
			</div>
		);
	},
});
