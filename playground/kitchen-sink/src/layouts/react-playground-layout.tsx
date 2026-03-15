/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { RequestLocals } from '@ecopages/core';
import { primaryLinks } from '@/data/primary-links';
import type { ReactNode } from 'react';

type ReactPlaygroundLayoutProps = {
	children?: ReactNode;
	locals?: RequestLocals;
};

export const ReactPlaygroundLayout = eco.component<ReactPlaygroundLayoutProps, ReactNode>({
	integration: 'react',
	render: ({ children, locals }) => {
		const requestInfo = locals?.requestInfo;
		const viewerRole = locals?.viewerRole;

		return (
			<div className="min-h-dvh flex flex-col bg-background text-on-background">
				<header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
					<div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Kitchen sink</p>
							<h1 className="font-display text-2xl font-semibold tracking-tight">
								React route lane with SPA navigation handoff
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
							<span className="badge">layout: react</span>
						</div>
					</div>
					<nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-5 text-sm">
						{primaryLinks.map((link) => (
							<a key={link.href} href={link.href} className="button text-on-background">
								{link.label}
							</a>
						))}
					</nav>
				</header>
				<main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
				<footer className="mx-auto flex max-w-6xl flex-col gap-2 px-6 pb-10 text-sm text-muted lg:flex-row lg:items-center lg:justify-between">
					<p>React-owned route layouts stay mounted while the page content swaps through EcoRouter.</p>
					<p>Use the in-page links to exercise React-to-React navigation without leaving the route set.</p>
				</footer>
			</div>
		);
	},
});