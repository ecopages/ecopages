import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { DocsBar } from '@/docs-kit/components/docs-bar';
import { getDocsLlmUrl } from '@/docs-kit/llm/docs-llm-url';
import { resolveDocsBreadcrumb } from '@/docs-kit/navigation/resolve-docs-breadcrumb';
import { docsManifestConfig } from '@/docs-kit/manifest/docs-manifest.config';
import { BaseLayout } from '@/layouts/base-layout';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		components: [BaseLayout, DocsBar],
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? getDocsLlmUrl(section, slug) : undefined;
		const crumbs = section && slug ? resolveDocsBreadcrumb(docsManifestConfig, section, slug) : [];

		return (
			<BaseLayout class="docs-layout">
				<aside class="docs-layout__aside">
					<nav aria-label="Docs">
						<ul>
							{docsManifestConfig.sections.map((manifestSection) => (
								<li>
									<p>{manifestSection.title}</p>
									<ul>
										{manifestSection.pages.map((page) => {
											const href = `${docsManifestConfig.rootDir}/${page.section}/${page.slug}`;

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
			</BaseLayout>
		);
	},
});

export default DocsLayout;
