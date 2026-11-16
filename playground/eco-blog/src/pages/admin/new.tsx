import { eco } from '@ecopages/core';
import { PostEditor } from '@/components/post-editor/post-editor';
import { AdminShell } from '@/layouts/admin-shell/admin-shell';
import { requireSession } from '@/lib/require-session.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	props: ({ locals }) => ({ userName: locals.session.user.name }),
	metadata: () => ({ title: 'New post | EcoBlog author', description: 'Write a new blog post.' }),
	render: ({ userName }) => (
		<AdminShell current="new" userName={userName}>
			<PostEditor />
		</AdminShell>
	),
});
