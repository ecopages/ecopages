import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { SignupForm } from '@/components/signup-form';
import { isGithubAuthEnabled } from '@/lib/auth.server';
import { messageForOAuthError } from '@/lib/oauth-error';

type SignupPageProps = {
	githubEnabled: boolean;
};

export default eco.page<SignupPageProps>({
	layout: BaseLayout,
	cache: 'dynamic',
	staticProps: async () => ({
		props: { githubEnabled: isGithubAuthEnabled },
	}),
	metadata: ({ props: { githubEnabled } }) => ({
		title: 'Create account',
		description: githubEnabled
			? 'Create a new account with GitHub or email.'
			: 'Create a new account with email and password.',
	}),
	render: ({ githubEnabled = false, query }) => (
		<div className="mx-auto max-w-md">
			<h1 className="text-3xl font-bold tracking-tight text-on-background">Create account</h1>
			<p className="mt-2 text-muted">
				{githubEnabled ? 'Continue with GitHub or enter your details.' : 'Enter your details to get started.'}
			</p>
			<SignupForm githubEnabled={githubEnabled} oauthError={messageForOAuthError(query)} />
			<p className="mt-6 text-center text-sm text-muted">
				Already have an account?{' '}
				<a href="/login" className="font-medium text-link hover:underline">
					Sign in
				</a>
			</p>
		</div>
	),
});
