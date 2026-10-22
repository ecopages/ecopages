import { eco } from '@ecopages/core';
import { PostEditor } from '@/components/post-editor/post-editor.kita';
import { AdminLayout } from '@/layouts/admin-layout.kita';
import { requireSession } from '@/lib/require-session.server';

export default eco.page({
	layout: AdminLayout,
	cache: 'dynamic',
	middleware: [requireSession],
	requires: ['session'] as const,
	metadata: () => ({ title: 'New Post | Admin', description: 'Write a new blog post' }),
	render: () => <PostEditor />,
});
