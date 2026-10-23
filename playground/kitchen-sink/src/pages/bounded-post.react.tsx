/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { Component, Suspense, type ReactNode } from 'react';
import { createLazyCollectionComponents } from '@ecopages/react/lazy-collection-components';
import { getEntry } from 'ecopages:content/posts';
import { loadComponent } from 'ecopages:content/posts/component';
import { getEntryDependencies } from 'ecopages:content/posts/server';
import type { PostContentEntry } from '@/content/posts';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout.react';

type BoundedPostPageProps = {
	entry: PostContentEntry;
};

const posts = createLazyCollectionComponents(loadComponent);

/**
 * @remarks Fallback `ecopages:content/*` types use untyped frontmatter until collection generate runs.
 */
function asPostContentEntry(entry: ReturnType<typeof getEntry>): PostContentEntry {
	return entry as PostContentEntry;
}

class EntryErrorBoundary extends Component<{ children?: ReactNode }, { error?: unknown }> {
	override state: { error?: unknown } = {};

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	override render(): ReactNode {
		if (this.state.error) {
			return <p data-testid="entry-error">entry failed</p>;
		}
		return this.props.children;
	}
}

export default eco.page<BoundedPostPageProps, ReactNode>({
	layout: ReactPlaygroundLayout,
	staticProps: async () => ({ props: { entry: asPostContentEntry(getEntry('first-post')) } }),
	dependencies: async ({ props }) => getEntryDependencies(props.entry.slug),
	metadata: ({ props: { entry } }) => ({
		title: `${entry.title} | Bounded | Kitchen Sink`,
		description: entry.description,
	}),
	render: ({ entry }) => {
		const Content = posts.get(entry.slug);
		return (
			<div className="space-y-6" data-testid="page-post-bounded">
				<p data-testid="bounded-rest">rest of the page</p>
				<EntryErrorBoundary>
					<Suspense fallback={<p data-testid="post-loading">Loading post</p>}>
						<Content />
					</Suspense>
				</EntryErrorBoundary>
			</div>
		);
	},
});
