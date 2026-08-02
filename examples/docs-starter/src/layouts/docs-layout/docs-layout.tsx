import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiSidebar,
	RuiSidebarContent,
	RuiSidebarGroup,
	RuiSidebarGroupHeader,
	RuiSidebarInset,
	RuiSidebarMenu,
	RuiSidebarMenuButton,
	RuiSidebarMenuItem,
	RuiSidebarProvider,
	RuiSidebarSeparator,
	RuiSidebarTrigger,
} from '@ecopages/radiant-ui/sidebar';
import { RuiToc } from '@ecopages/radiant-ui/toc';
import type { BreadcrumbItem } from '@/components/breadcrumb/breadcrumb';
import { docsNav } from '@/content-nav';
import { BaseLayout } from '@/layouts/base-layout';
import { DocsBar } from './docs-bar';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

const DOCS_SIDEBAR_ID = 'docs-sidebar';
const ECO_NAVIGATION_EVENTS = 'eco:page-load,eco:after-swap';

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
		scripts: ['./docs-layout.script.ts'],
		components: [BaseLayout, DocsBar],
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? `/docs-llm/${section}/${slug}.md` : undefined;
		const crumbs = breadcrumbForPage(section, slug);

		return (
			<BaseLayout showHeader={false}>
				<RuiSidebarProvider
					layout="docs"
					class="docs-layout"
					siteHeader={
						<div class="rui-sidebar-provider__site-header-inner">
							<div class="rui-sidebar-provider__site-header-start">
								<RuiSidebarTrigger
									class="md:hidden"
									placement="inset"
									controls={DOCS_SIDEBAR_ID}
									triggerLabel="Toggle documentation navigation"
								/>
								<a class="rui-sidebar-provider__site-header-brand" href="/">
									Docs starter
								</a>
							</div>
						</div>
					}
					sidebar={
						<RuiSidebar
							id={DOCS_SIDEBAR_ID}
							data={{ ecoPersist: DOCS_SIDEBAR_ID }}
							collapsible="off"
							defaultWidth={250}
							mobileBreakpoint={768}
							label="Documentation navigation"
							matchActive
							scrollActiveOnMount
							navigationEvents={ECO_NAVIGATION_EVENTS}
						>
							<RuiSidebarContent aria-label="Documentation navigation">
								{docsNav.sections.map((section, index) => (
									<>
										{index > 0 ? <RuiSidebarSeparator aria-label="Section divider" /> : null}
										<RuiSidebarGroup aria-label={section.title}>
											<RuiSidebarGroupHeader label={section.title} />
											<RuiSidebarMenu aria-label={`${section.title} links`}>
												{section.items.map((page) => (
													<RuiSidebarMenuItem>
														<RuiSidebarMenuButton as="a" href={page.href}>
															{page.title}
														</RuiSidebarMenuButton>
													</RuiSidebarMenuItem>
												))}
											</RuiSidebarMenu>
										</RuiSidebarGroup>
									</>
								))}
							</RuiSidebarContent>
						</RuiSidebar>
					}
				>
					<RuiSidebarInset>
						<div class="docs-layout__content">
							<DocsBar crumbs={crumbs} llmUrl={llmUrl} />
							<div class="prose">{children}</div>
						</div>
					</RuiSidebarInset>
					<RuiToc
						class="docs-layout__toc"
						target=".docs-layout__content"
						headingSelector="h2,h3"
						label="On this page"
						scrollOffset={120}
						navigationEvents={ECO_NAVIGATION_EVENTS}
					/>
				</RuiSidebarProvider>
			</BaseLayout>
		);
	},
});

export default DocsLayout;
