import type { ReactNode } from 'react';
import { AuthNav } from '@/components/auth-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { AnnouncementBar } from '@/components/announcement-bar';
import { eco, type WithLocals } from '@ecopages/core';

type BaseLayoutProps = WithLocals<{ children: ReactNode }>;

export const BaseLayout = eco.component<BaseLayoutProps, ReactNode>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		components: [AuthNav, ThemeToggle, AnnouncementBar],
	},
	render: ({ children, locals }) => {
		return (
			<div className="layout">
				<AnnouncementBar slideDown />
				<header className="layout__header">
					<nav className="layout__nav" aria-label="Main">
						<a href="/" className="layout__logo">
							Ecopages
						</a>
						<div className="layout__nav-items">
							<AuthNav initialSession={locals?.session} />
							<ThemeToggle />
						</div>
					</nav>
				</header>
				<main className="layout__main" id="main-content">
					<div className="layout__content">{children}</div>
				</main>
				<footer className="layout__footer">
					<div className="layout__footer-content">
						<p>&copy; {new Date().getFullYear()} Ecopages + Better Auth.</p>
					</div>
				</footer>
			</div>
		);
	},
});
