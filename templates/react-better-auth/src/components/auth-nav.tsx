'use client';

import { authClient } from '@/lib/auth-client';
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import type { Session } from '@/handlers/auth.server';

type AuthNavProps = {
	initialSession?: Session | null;
};

export const AuthNav = eco.component<AuthNavProps, ReactNode>({
	dependencies: {
		stylesheets: ['./auth-nav.css'],
	},
	render: ({ initialSession }) => {
		const { data: clientSession, isPending } = authClient.useSession();

		if (isPending && !initialSession) {
			return null;
		}

		const session = clientSession ?? initialSession;

		if (session?.user) {
			return (
				<div className="auth-nav">
					<a href="/dashboard" className="btn btn-ghost">
						Dashboard
					</a>
					<button
						type="button"
						className="btn btn-outline h-9 px-3"
						aria-label="Sign out"
						onClick={async () => {
							await authClient.signOut();
							window.location.assign('/');
						}}
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
