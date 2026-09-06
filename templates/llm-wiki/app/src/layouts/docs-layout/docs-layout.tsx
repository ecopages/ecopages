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
import { Logo } from '@/components/logo/logo';
import { ThemeToggle } from '@/components/theme-toggle/theme-toggle';
import { wikiNav, type WikiNav } from '@/content-nav';
import { BaseLayout } from '@/layouts/base-layout';
import { SearchBox } from '@/lib/search/search-box';
import { DocsPagination } from './components/docs-pagination';
import { DocsBar, type BreadcrumbItem } from './docs-bar';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
	/** Nav tree to render in the sidebar/breadcrumbs. Defaults to `wikiNav`. */
	nav?: WikiNav;
	/** Breadcrumb root label. Defaults to `'Wiki'`. */
	rootLabel?: string;
	/** Source names linked from this page's frontmatter. */
	sources?: string[];
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

const DOCS_SIDEBAR_ID = 'wiki-sidebar';
const ECO_NAVIGATION_EVENTS = 'eco:page-load,eco:after-swap';

function breadcrumbForPage(
	nav: WikiNav,
	rootLabel: string,
	section: string | undefined,
	slug: string | undefined,
): BreadcrumbItem[] {
	if (!section || !slug) {
		return [];
	}

	const contentSection = nav.sections.find((entry) => entry.id === section);
	const page = contentSection?.items.find((entry) => entry.slug === slug);

	if (!contentSection || !page) {
		return [];
	}

	const firstSection = nav.sections[0];
	const firstPage = firstSection?.items[0];
	const firstSectionPage = contentSection.items[0];

	return [
		{ label: rootLabel, href: firstPage?.href ?? nav.rootDir },
		{ label: contentSection.title, href: firstSectionPage?.href },
		{ label: page.title },
	];
}

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		scripts: ['./docs-layout.script.ts'],
	},
	render: ({ children, section, slug, nav = wikiNav, rootLabel = 'Wiki', sources = [] }: DocsLayoutRenderProps) => {
		const crumbs = breadcrumbForPage(nav, rootLabel, section, slug);
		const paginationData = JSON.stringify({
			pages: nav.sections.flatMap((navSection) => navSection.items).map(({ href, title }) => ({ href, title })),
		});

		return (
			<BaseLayout showHeader={false}>
				<script type="application/json" id="docs-pagination-data" safe>
					{paginationData}
				</script>
				<RuiSidebarProvider
					layout="docs"
					class="docs-layout"
					siteHeader={
						<div class="rui-sidebar-provider__site-header-inner">
							<div class="rui-sidebar-provider__site-header-start">
								<RuiSidebarTrigger
									class="md:hidden rui-sidebar-trigger-placement--header"
									placement="header"
									controls={DOCS_SIDEBAR_ID}
									triggerLabel="Close wiki navigation"
								/>
								<RuiSidebarTrigger
									class="md:hidden rui-sidebar-trigger-placement--inset"
									placement="inset"
									controls={DOCS_SIDEBAR_ID}
									triggerLabel="Open wiki navigation"
								/>
								<div class="rui-sidebar-provider__site-header-brand">
									<Logo>LLM Wiki</Logo>
								</div>
							</div>
							<nav class="rui-sidebar-provider__site-header-nav" aria-label="Site">
								<SearchBox
									indexUrl="/search-index.json"
									placeholder="Search the wiki…"
									label="Search the wiki"
								/>
								<ThemeToggle id="toggle-dark-mode" label="Theme" data-eco-persist="theme-toggle" />
							</nav>
						</div>
					}
					sidebar={
						<RuiSidebar
							id={DOCS_SIDEBAR_ID}
							data={{ ecoPersist: DOCS_SIDEBAR_ID }}
							collapsible="off"
							defaultWidth={250}
							mobileBreakpoint={768}
							mobileDefaultOpen={false}
							label="Wiki navigation"
							matchActive
							scrollActiveOnMount
							navigationEvents={ECO_NAVIGATION_EVENTS}
						>
							<RuiSidebarContent aria-label="Wiki navigation">
								{nav.sections.map((section, index) => (
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
							<DocsBar crumbs={crumbs} />
							<div class="prose">{children}</div>
							{sources.length > 0 ? (
								<div class="docs-layout__sources">
									<h2>Sources</h2>
									<ul>
										{sources.map((name) => (
											<li>
												<a href={`/sources/${name}.md`} target="_blank" rel="noopener">
													{name}
												</a>
											</li>
										))}
									</ul>
								</div>
							) : null}
							<DocsPagination />
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
