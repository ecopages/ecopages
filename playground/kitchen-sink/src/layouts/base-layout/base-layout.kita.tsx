import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import { ThemeToggle } from '../../components/theme-toggle.kita';
import { requestLayoutProps, type RequestLayoutProps } from '../request-layout-props';
import { getPrimaryLinkTestId, kitchenSinkShell, kitchenSinkShellTestId, primaryLinks } from '@/data/primary-links';

export const BaseLayout = eco.layout({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, requestInfo, viewerRole }: LayoutProps & RequestLayoutProps) => {
		return (
			<div class="min-h-dvh flex flex-col bg-background text-on-background" data-testid={kitchenSinkShellTestId}>
				<header class="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
					<div class="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
						<div class="space-y-1">
							<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">
								{kitchenSinkShell.eyebrow}
							</p>
							<h1 class="font-display text-2xl font-semibold tracking-tight">{kitchenSinkShell.title}</h1>
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
					<nav
						data-eco-persist="primary-nav"
						class="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-5 text-sm"
					>
						{primaryLinks.map((link) => (
							<a
								href={link.href}
								data-testid={getPrimaryLinkTestId(link.href)}
								class="button text-on-background"
							>
								{link.label}
							</a>
						))}
					</nav>
				</header>
				<main class="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
				<footer class="mx-auto flex max-w-6xl flex-col gap-2 px-6 pb-10 text-sm text-muted lg:items-center lg:justify-between">
					<p>{kitchenSinkShell.footerLead}</p>
					<p>{kitchenSinkShell.footerTrail}</p>
				</footer>
			</div>
		);
	},
});

/** Layout entry for dynamic pages that run `requestInfoMiddleware`. */
export const requestInfoBaseLayout = {
	component: BaseLayout,
	props: requestLayoutProps,
};
