import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { SignupForm } from '@/components/signup-form';

export default eco.page({
	layout: BaseLayout,
	dependencies: {
		components: [SignupForm],
	},
	metadata: () => ({
		title: 'Create account',
		description: 'Create a new account with email and password.',
	}),
	render: () => (
		<div className="mx-auto max-w-md">
			<h1 className="text-3xl font-bold tracking-tight text-[var(--color-on-background)]">Create account</h1>
			<p className="mt-2 text-[var(--color-muted)]">Enter your details to get started.</p>
			<SignupForm />
			<p className="mt-6 text-center text-sm text-[var(--color-muted)]">
				Already have an account?{' '}
				<a href="/login" className="font-medium text-[var(--color-link)] hover:underline">
					Sign in
				</a>
			</p>
		</div>
	),
});
