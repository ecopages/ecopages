'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Github, X } from './icons';

const WARNING_STORAGE_KEY = 'github-auth-warning-dismissed';

type SocialSignInProps = {
	disabled?: boolean;
	enabled: boolean;
	errorCallbackURL: string;
};

/**
 * Shown when GitHub OAuth env vars are missing.
 *
 * @remarks
 * Remove this warning (and the `enabled === false` branch) if the app should
 * only offer email/password login.
 */
function GithubAuthWarning() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		setVisible(localStorage.getItem(WARNING_STORAGE_KEY) !== 'true');
	}, []);

	if (!visible) {
		return null;
	}

	return (
		<aside className="github-auth-warning" role="status">
			<p className="github-auth-warning__text">
				GitHub sign-in is off. Set <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> in{' '}
				<code>.env</code>. If you only want password login, remove this warning from{' '}
				<code>social-sign-in.tsx</code>.
			</p>
			<button
				type="button"
				className="github-auth-warning__close"
				aria-label="Dismiss GitHub setup warning"
				onClick={() => {
					localStorage.setItem(WARNING_STORAGE_KEY, 'true');
					setVisible(false);
				}}
			>
				<X size={16} />
			</button>
		</aside>
	);
}

export function SocialSignIn({ disabled = false, enabled, errorCallbackURL }: SocialSignInProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!enabled) {
		return <GithubAuthWarning />;
	}

	async function handleGithubSignIn() {
		setError(null);
		setIsLoading(true);

		try {
			const { error: err } = await authClient.signIn.social({
				provider: 'github',
				callbackURL: new URL('/dashboard', window.location.origin).toString(),
				errorCallbackURL: new URL(errorCallbackURL, window.location.origin).toString(),
			});

			if (err) {
				setError(err.message ?? 'GitHub sign in failed.');
				setIsLoading(false);
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'GitHub sign in failed.');
			setIsLoading(false);
		}
	}

	return (
		<div className="social-sign-in">
			<p className="social-sign-in__divider">or</p>
			{error && (
				<div className="social-sign-in__alert" role="alert" aria-live="polite">
					{error}
				</div>
			)}
			<button
				type="button"
				className="social-sign-in__github"
				onClick={handleGithubSignIn}
				disabled={disabled || isLoading}
			>
				<Github size={18} />
				{isLoading ? 'Redirecting to GitHub…' : 'Continue with GitHub'}
			</button>
		</div>
	);
}
