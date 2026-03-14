'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { eco } from '@ecopages/core';

export const LoginForm = eco.component({
	dependencies: {
		stylesheets: ['./login-form.css'],
	},
	render: () => {
		const [email, setEmail] = useState('');
		const [password, setPassword] = useState('');
		const [error, setError] = useState<string | null>(null);
		const [isLoading, setIsLoading] = useState(false);

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
			</form>
		);
	},
});
