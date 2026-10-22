import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { AuthForm } from '@/components/auth-form/auth-form';
import { SiteLayout } from '@/layouts/site-layout/site-layout';

export default eco.page<{}, JsxRenderable>({
	layout: SiteLayout,
	metadata: () => ({ title: 'Create an account | EcoBlog', description: 'Create an author account.' }),
	render: () => (
		<AuthForm
			title="Create an account"
			intro="Authors can write and publish posts."
			action="/api/auth/sign-up/email"
			submitLabel="Create account"
			fields={[
				{ name: 'name', label: 'Name', type: 'text', autocomplete: 'name' },
				{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
				{ name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password' },
			]}
			footer={
				<>
					Already writing here? <a href="/login">Sign in</a>
				</>
			}
		/>
	),
});
