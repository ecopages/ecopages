'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { eco } from '@ecopages/core';
import { SocialSignIn } from './social-sign-in';
import { clearOAuthErrorParams, messageForOAuthError } from '@/lib/oauth-error';
import './signup-form.css';
import './social-sign-in.css';

type SignupFormProps = {
	githubEnabled: boolean;
	oauthError?: string | null;
};

export const SignupForm = eco.component<SignupFormProps, ReactNode>({
	render: ({ githubEnabled = false, oauthError = null }) => {
		const [name, setName] = useState('');
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

			const { error: err } = await authClient.signUp.email({
				name,
				email,
				password,
			});

			if (err) {
				setError(err.message ?? 'Sign up failed. Try again.');
				setIsLoading(false);
				return;
			}

			window.location.assign('/dashboard');
		}

		return (
			<form onSubmit={handleSubmit} className="signup-form" noValidate aria-label="Create account form">
				{error && (
					<div className="signup-form__alert" role="alert" aria-live="polite">
						{error}
					</div>
				)}
				<div>
					<label htmlFor="signup-name" className="signup-form__label">
						Name
					</label>
					<input
						id="signup-name"
						type="text"
						name="name"
						autoComplete="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						disabled={isLoading}
						placeholder="Your name…"
						className="signup-form__input"
					/>
				</div>
				<div>
					<label htmlFor="signup-email" className="signup-form__label">
						Email
					</label>
					<input
						id="signup-email"
						type="email"
						name="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						disabled={isLoading}
						placeholder="you@example.com…"
						spellCheck={false}
						className="signup-form__input"
					/>
				</div>
				<div>
					<label htmlFor="signup-password" className="signup-form__label">
						Password
					</label>
					<input
						id="signup-password"
						type="password"
						name="password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						minLength={8}
						disabled={isLoading}
						placeholder="At least 8 character..."
						className="signup-form__input"
					/>
					<p className="signup-form__helper-text">Minimum 8 characters.</p>
				</div>
				<button type="submit" disabled={isLoading} className="btn btn-primary w-full">
					{isLoading ? 'Creating account…' : 'Create account'}
				</button>
				<SocialSignIn disabled={isLoading} enabled={githubEnabled} errorCallbackURL="/signup" />
			</form>
		);
	},
});
