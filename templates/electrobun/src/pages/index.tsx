import { eco } from '@ecopages/core';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiHeadline } from '@ecopages/radiant-ui/headline';
import { RuiLabel } from '@ecopages/radiant-ui/label';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { ShellLayout } from '../layouts/shell-layout';
import { withSession } from '../lib/auth.server';
import { githubEnabled, origin } from '../lib/settings';

export default eco.page({
	cache: 'dynamic',
	middleware: [
		(ctx, next) =>
			withSession(
				ctx,
				() => Response.redirect(new URL('/dashboard', origin)),
				() => next(),
			),
	],
	dependencies: { scripts: [{ src: '../lib/github-sign-in.ts' }] },
	metadata: () => ({ title: 'Sign in', description: 'Sign in to your workspace.' }),
	layout: ShellLayout,
	render: ({ query }) => {
		const signup = query?.mode === 'signup';
		const showGithub = !signup && githubEnabled;
		const error =
			query?.error === 'login'
				? 'Check your email and password and try again.'
				: query?.error === 'signup'
					? 'Could not create your account. Check your details and try again.'
					: '';
		return (
			<main class="sign-in">
				<section class="sign-in-panel" aria-labelledby="sign-in-title">
					<RuiHeadline as="h1" size={false} class="panel-title" id="sign-in-title">
						{signup ? 'Create an account' : 'Sign in'}
					</RuiHeadline>
					{showGithub && (
						<div class="social">
							<RuiButton type="button" variant="filled" id="github-sign-in" class="github-button">
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
									<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
								</svg>
								<span>Continue with GitHub</span>
							</RuiButton>
							<p id="github-status" role="status" hidden />
							<div class="divider">or use email</div>
						</div>
					)}
					{error && (
						<p class="form-error" role="alert">
							{error}
						</p>
					)}
					<CredentialsForm signup={signup} secondary={showGithub} />
					<a class="form-link" href={signup ? '/' : '/?mode=signup'}>
						{signup ? 'Back to sign in' : 'Create an account'}
					</a>
				</section>
			</main>
		);
	},
});

function CredentialsForm({ signup, secondary }: { signup: boolean; secondary: boolean }) {
	return (
		<form class="sign-in-form" action="/auth/credentials" method="post">
			<input type="hidden" name="intent" value={signup ? 'signup' : 'login'} />
			{signup && (
				<RuiLabel>
					Name
					<RuiInput name="name" autocomplete="name" required />
				</RuiLabel>
			)}
			<RuiLabel>
				Email
				<RuiInput name="email" type="email" autocomplete="email" required />
			</RuiLabel>
			<RuiLabel>
				Password
				<RuiInput
					name="password"
					type="password"
					autocomplete={signup ? 'new-password' : 'current-password'}
					minLength={signup ? 8 : undefined}
					maxLength={128}
					required
				/>
			</RuiLabel>
			<RuiButton type="submit" variant={secondary ? 'outline' : 'filled'}>
				{signup ? 'Create account' : 'Sign in'}
			</RuiButton>
		</form>
	);
}
