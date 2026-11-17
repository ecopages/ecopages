import type { ReactNode } from 'react';
import { AuthNav } from '@/components/auth-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { AnnouncementBar } from '@/components/announcement-bar';
import type { EcoPageLayoutEntrySpec, LayoutProps } from '@ecopages/core';
import type { AuthNavSession } from '@/components/auth-nav';
import type { Session } from '@/handlers/auth.server';
import './base-layout.css';

type BaseLayoutProps = LayoutProps<ReactNode> & {
	session?: AuthNavSession | null;
};

type SessionLocals = { session: Session };

/**
 * Layout entry for dynamic pages behind the auth middleware.
 *
 * @remarks
 * The factory annotates the local it reads, so a Page must list `authMiddleware` to use it. It runs on the server
 * and its result is also sent to the browser for hydration, so it returns only the user, never the session token.
 */
export const authenticatedLayout = {
	component: BaseLayout,
	props: ({ locals }: { locals: SessionLocals }) => ({ session: { user: locals.session.user } }),
} satisfies EcoPageLayoutEntrySpec<ReactNode, { locals: SessionLocals }>;

export function BaseLayout({ children, session }: BaseLayoutProps) {
	return (
		<div className="layout">
			<AnnouncementBar slideDown />
			<header className="layout__header">
				<nav className="layout__nav" aria-label="Main">
					<a href="/" className="layout__logo">
						Ecopages
					</a>
					<div className="layout__nav-items">
						<AuthNav initialSession={session} />
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
}
