import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { LoginForm } from '@/components/login-form';
import { isGithubAuthEnabled } from '@/lib/auth.server';
import { messageForOAuthError } from '@/lib/oauth-error';

type LoginPageProps = {
	githubEnabled: boolean;
};

export default eco.page<LoginPageProps>({
	layout: BaseLayout,
	cache: 'dynamic',
	staticProps: async () => ({
		props: { githubEnabled: isGithubAuthEnabled },
	}),
	metadata: ({ props: { githubEnabled } }) => ({
		title: 'Sign in',
		description: githubEnabled ? 'Sign in with GitHub or email.' : 'Sign in with your email and password.',
	}),
	render: ({ githubEnabled = false, query }) => (
		<div className="mx-auto max-w-md">
			<h1 className="text-3xl font-bold tracking-tight text-on-background">Sign in</h1>
			<p className="mt-2 text-muted">
				{githubEnabled
					? 'Sign in with GitHub or your email and password.'
					: 'Sign in with your email and password.'}
			</p>
			<LoginForm githubEnabled={githubEnabled} oauthError={messageForOAuthError(query)} />
			<p className="mt-6 text-center text-sm text-muted">
				Don&apos;t have an account?{' '}
				<a href="/signup" className="font-medium text-link hover:underline">
					Sign up
				</a>
			</p>
		</div>
	),
});
