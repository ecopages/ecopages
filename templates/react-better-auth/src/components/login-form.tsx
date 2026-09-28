'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { eco } from '@ecopages/core';
import { SocialSignIn } from './social-sign-in';
import { clearOAuthErrorParams, messageForOAuthError } from '@/lib/oauth-error';
import './login-form.css';
import './social-sign-in.css';

type LoginFormProps = {
	githubEnabled: boolean;
	oauthError?: string | null;
};

export const LoginForm = eco.component<LoginFormProps, ReactNode>({
	render: ({ githubEnabled = false, oauthError = null }) => {
		const [email, setEmail] = useState('');
		const [password, setPassword] = useState('');
		const [error, setError] = useState<string | null>(oauthError);
		const [isLoading, setIsLoading] = useState(false);

		useEffect(() => {
			const fromUrl = messageForOAuthError(new URLSearchParams(window.location.search));
			if (fromUrl) {
				setError(fromUrl);
			}
			if (fromUrl || oauthError) {
				clearOAuthErrorParams();
			}
		}, [oauthError]);

		async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
			e.preventDefault();
			setError(null);
			setIsLoading(true);

			try {
				const { data, error: err } = await authClient.signIn.email({
					email,
					password,
				});

				if (err) {
					setError(err.message ?? 'Sign in failed. Check your email and password.');
					return;
				}

				if (data) {
					await new Promise((resolve) => setTimeout(resolve, 100));
					window.location.assign('/dashboard');
				}
			} catch (caught) {
				setError(caught instanceof Error ? caught.message : 'Sign in failed.');
			} finally {
				setIsLoading(false);
			}
		}

		return (
			<form className="login-form" onSubmit={handleSubmit}>
				{error && (
					<div className="login-form__alert" role="alert" aria-live="polite">
						{error}
					</div>
				)}
				<div>
					<label htmlFor="login-email" className="login-form__label">
						Email
					</label>
					<input
						id="login-email"
						type="email"
						name="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						disabled={isLoading}
						placeholder="you@example.com…"
						spellCheck={false}
						className="login-form__input"
					/>
				</div>
				<div>
					<label htmlFor="login-password" className="login-form__label">
						Password
					</label>
					<input
						id="login-password"
						type="password"
						name="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						disabled={isLoading}
						placeholder="••••••••"
						className="login-form__input"
					/>
				</div>
				<button type="submit" disabled={isLoading} className="btn btn-primary w-full">
					{isLoading ? 'Signing in…' : 'Sign in'}
				</button>
				<SocialSignIn disabled={isLoading} enabled={githubEnabled} errorCallbackURL="/login" />
			</form>
		);
	},
});
