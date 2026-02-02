'use client';

import { authClient } from '@/lib/auth-client';
import { eco } from '@ecopages/core';

export const AuthNav = eco.component({
	dependencies: {
		stylesheets: ['./auth-nav.css'],
	},
	render: () => {
		const { data: session, isPending } = authClient.useSession();

		if (isPending) {
			return (
				<span className="auth-nav__loading" aria-live="polite">
					Loading…
				</span>
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
						onClick={() =>
							authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } })
						}
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
