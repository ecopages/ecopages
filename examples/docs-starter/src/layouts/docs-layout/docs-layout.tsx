import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { BreadcrumbItem } from '@/components/breadcrumb/breadcrumb';
import { docsNav } from '@/content-nav';
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

function breadcrumbForPage(section: string | undefined, slug: string | undefined): BreadcrumbItem[] {
	if (!section || !slug) {
		return [];
	}

	const contentSection = docsNav.sections.find((entry) => entry.id === section);
	const page = contentSection?.items.find((entry) => entry.slug === slug);

	if (!contentSection || !page) {
		return [];
	}

	const firstSection = docsNav.sections[0];
	const firstPage = firstSection?.items[0];
	const docsIndexHref =
		firstSection && firstPage ? `${docsNav.rootDir}/${firstSection.id}/${firstPage.slug}` : docsNav.rootDir;
	const firstSectionPage = contentSection.items[0];

	return [
		{ label: 'Docs', href: docsIndexHref },
		{
			label: contentSection.title,
			href: firstSectionPage ? `${docsNav.rootDir}/${section}/${firstSectionPage.slug}` : undefined,
		},
		{ label: page.title },
	];
}

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		components: [BaseLayout, DocsBar],
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? `/docs-llm/${section}/${slug}.md` : undefined;
		const crumbs = breadcrumbForPage(section, slug);

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
