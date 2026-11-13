import { eco } from '@ecopages/core';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { ShellLayout } from '../layouts/shell-layout';
import { requireSession } from '../lib/auth.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	requires: ['workspace'] as const,
	metadata: () => ({ title: 'Account', description: 'Your account information.' }),
	layout: { component: ShellLayout, props: () => ({ workspace: { current: '/account', title: 'Account' } }) },
	render: ({ locals }) => {
		const user = locals.workspace.session.user;
		return (
			<div class="account-card">
				<dl class="account-details">
					<div>
						<dt>Name</dt>
						<dd>{user.name}</dd>
					</div>
					<div>
						<dt>Email</dt>
						<dd>{user.email}</dd>
					</div>
				</dl>
				<form class="account-actions" action="/auth/sign-out" method="post">
					<RuiButton type="submit" variant="outline">
						Sign out
					</RuiButton>
				</form>
			</div>
		);
	},
});
