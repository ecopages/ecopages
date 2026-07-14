import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { docsNav } from '@/content-nav';
import { getDocsLlmUrl } from '@/lib/docs/docs-llm-url';
import { resolveDocsBreadcrumb } from '@/lib/docs/resolve-docs-breadcrumb';
import { BaseLayout } from '@/layouts/base-layout';
import { DocsBar } from './docs-bar';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

type ShellLayoutProps = {
	class?: string;
	children?: JsxRenderable;
};

const ShellLayout = BaseLayout as (props: ShellLayoutProps) => JsxRenderable;

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		components: [BaseLayout, DocsBar],
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? getDocsLlmUrl(section, slug) : undefined;
		const crumbs = section && slug ? resolveDocsBreadcrumb(docsNav, section, slug) : [];

		return (
			<ShellLayout class="docs-layout">
				<aside class="docs-layout__aside">
					<nav aria-label="Docs">
						<ul>
							{docsNav.sections.map((contentSection) => (
								<li>
									<p>{contentSection.title}</p>
									<ul>
										{contentSection.items.map((page) => (
											<li>
												<a href={page.href}>{page.title}</a>
											</li>
										))}
									</ul>
								</li>
							))}
						</ul>
					</nav>
				</aside>
				<div class="docs-layout__content">
					<DocsBar crumbs={crumbs} llmUrl={llmUrl} />
					<div class="prose">{children}</div>
				</div>
			</ShellLayout>
		);
	},
});

export default DocsLayout;
