import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { AuthForm } from '@/components/auth-form/auth-form';
import { SiteLayout } from '@/layouts/site-layout/site-layout';

export default eco.page<{}, JsxRenderable>({
	layout: SiteLayout,
	metadata: () => ({ title: 'Sign in | EcoBlog', description: 'Sign in to the author area.' }),
	render: () => (
		<AuthForm
			title="Sign in"
			intro="Sign in to write and edit posts."
			action="/api/auth/sign-in/email"
			submitLabel="Sign in"
			fields={[
				{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
				{ name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' },
			]}
			footer={
				<>
					No account yet? <a href="/signup">Create one</a>
				</>
			}
		/>
	),
});
