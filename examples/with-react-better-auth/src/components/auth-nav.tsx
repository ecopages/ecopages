'use client';

import { authClient } from '@/lib/auth-client';
import { eco } from '@ecopages/core';
import { ReactNode } from 'react';
import type { Session } from '@/handlers/auth';

type AuthNavProps = {
	session?: Session | null;
};

export const AuthNav = eco.component<AuthNavProps, ReactNode>({
	dependencies: {
		stylesheets: ['./auth-nav.css'],
	},
	render: ({ session: serverSession }) => {
		const { data: clientSession, isPending } = authClient.useSession();
		const session = serverSession ?? clientSession;

		if (!session && isPending) {
			return (
				<div className="auth-nav" aria-live="polite" aria-busy="true">
					<div className="btn-skeleton btn-skeleton--primary text-transparent">Dashboard</div>
					<div className="btn-skeleton btn-skeleton--primary text-transparent">Sign out</div>
				</div>
			);
		}

		if (session?.user) {
			return (
				<div className="auth-nav">
					<a href="/dashboard" className="btn btn-ghost">
						Dashboard
					</a>
					<button
						type="button"
						onClick={async () => {
							await authClient.signOut();
							window.location.assign('/');
						}}
						className="btn btn-outline h-9 px-3"
						aria-label="Sign out"
					>
						Sign out
					</button>
				</div>
			);
		}

		return (
			<div className="auth-nav">
				<a href="/login" className="auth-nav__link">
					Sign in
				</a>
				<a href="/signup" className="btn btn-primary h-9 px-3">
					Sign up
				</a>
			</div>
		);
	},
});
