import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { LoginForm } from '@/components/login-form';

export default eco.page({
	layout: BaseLayout,
	dependencies: {
		components: [LoginForm],
	},
	metadata: () => ({
		title: 'Sign in',
		description: 'Sign in to your account.',
	}),
	render: () => (
		<div className="mx-auto max-w-md">
			<h1 className="text-3xl font-bold tracking-tight text-on-background">Sign in</h1>
			<p className="mt-2 text-muted">Enter your email and password to continue.</p>
			<LoginForm />
			<p className="mt-6 text-center text-sm text-muted">
				Don&apos;t have an account?{' '}
				<a href="/signup" className="font-medium text-link hover:underline">
					Sign up
				</a>
			</p>
		</div>
	),
});
