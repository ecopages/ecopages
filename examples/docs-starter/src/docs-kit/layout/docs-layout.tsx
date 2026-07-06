import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import '@/docs-kit.instance';
import { DocsBar } from '@/docs-kit/components/docs-bar';
import { getDocsKit } from '@/docs-kit/config';
import { getDocsLlmUrl } from '@/docs-kit/llm/docs-llm-url';
import { resolveDocsBreadcrumb } from '@/docs-kit/navigation/resolve-docs-breadcrumb';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

type ShellLayoutProps = {
	class?: string;
	children?: JsxRenderable;
};

const { content, layoutComponents, shellLayout } = getDocsKit();
const ShellLayout = shellLayout as (props: ShellLayoutProps) => JsxRenderable;

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		components: layoutComponents,
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? getDocsLlmUrl(section, slug) : undefined;
		const crumbs = section && slug ? resolveDocsBreadcrumb(content, section, slug) : [];

		return (
			<ShellLayout class="docs-layout">
				<aside class="docs-layout__aside">
					<nav aria-label="Docs">
						<ul>
							{content.sections.map((contentSection) => (
								<li>
									<p>{contentSection.title}</p>
									<ul>
										{contentSection.pages.map((page) => {
											const href = `${content.rootDir}/${contentSection.id}/${page.slug}`;

											return (
												<li>
													<a href={href}>{page.title}</a>
												</li>
											);
										})}
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
