/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { RequestLocals } from '@ecopages/core';
import { ThemeToggleReact } from '@/components/theme-toggle.react';
import { getPrimaryLinkTestId, kitchenSinkShell, primaryLinks } from '@/data/primary-links';
import type { ReactNode } from 'react';

type ReactPlaygroundLayoutProps = {
	children?: ReactNode;
	locals?: RequestLocals;
};

export const ReactPlaygroundLayout = eco.component<ReactPlaygroundLayoutProps, ReactNode>({
	integration: 'react',
	dependencies: {
		components: [ThemeToggleReact],
		scripts: ['./base-layout/base-layout.script.ts'],
	},
	render: ({ children, locals }) => {
		const requestInfo = locals?.requestInfo;
		const viewerRole = locals?.viewerRole;

		return (
			<div className="min-h-dvh flex flex-col bg-background text-on-background">
				<header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
					<div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">
								{kitchenSinkShell.eyebrow}
							</p>
							<h1 className="font-display text-2xl font-semibold tracking-tight">
								{kitchenSinkShell.title}
							</h1>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted">
							{requestInfo ? (
								<span className="badge badge--mono">
									{requestInfo.requestId} {requestInfo.method} {requestInfo.pathname}
								</span>
							) : (
								<span className="badge">Static request context</span>
							)}
							<span className="badge">role: {viewerRole ?? 'viewer'}</span>
							<ThemeToggleReact />
						</div>
					</div>
					<nav
						data-eco-persist="primary-nav"
						className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-5 text-sm"
					>
						{primaryLinks.map((link) => (
							<a
								key={link.href}
								href={link.href}
								data-testid={getPrimaryLinkTestId(link.href)}
								className="button text-on-background"
							>
								{link.label}
							</a>
						))}
					</nav>
				</header>
				<main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
				<footer className="mx-auto flex max-w-6xl flex-col gap-2 px-6 pb-10 text-sm text-muted lg:flex-row lg:items-center lg:justify-between">
					<p>{kitchenSinkShell.footerLead}</p>
					<p>{kitchenSinkShell.footerTrail}</p>
				</footer>
			</div>
		);
	},
});
