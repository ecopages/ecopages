import { eco } from '@ecopages/core';
import { PostEditor } from '@/components/post-editor/post-editor';
import { AdminShell } from '@/layouts/admin-shell/admin-shell';
import { requireSession } from '@/lib/require-session.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	metadata: () => ({ title: 'New post | EcoBlog author', description: 'Write a new blog post.' }),
	render: ({ locals }) => (
		<AdminShell current="new" userName={locals.session.user.name}>
			<PostEditor />
		</AdminShell>
	),
});
