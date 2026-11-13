import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
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
import './docs-layout.css';
import { RuiToc } from '@ecopages/radiant-ui/toc';
import { ThemeToggle } from '@/components/theme-toggle/theme-toggle';
import { docsNav, type DocsNav } from '@/content-nav';
import { BaseLayout } from '@/layouts/base-layout';
import { buildDocsCrumbs } from '@/lib/docs/docs-crumbs';
import { getDocsLlmUrl } from '@/lib/docs/docs-llm-url';
import { DocsPagination } from './components/docs-pagination';
import { DocsBar } from './docs-bar';
import { CodeTabs } from '@/components/code-tabs';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

const DOCS_SIDEBAR_ID = 'docs-sidebar';
const ECO_NAVIGATION_EVENTS = 'eco:page-load,eco:after-swap';

const DocsNavigation = ({ nav }: { nav: DocsNav }) => (
	<>
		{nav.sections.map((section, index) => (
			<>
				{index > 0 ? <RuiSidebarSeparator aria-label="Section divider" /> : null}
				<RuiSidebarGroup aria-label={section.title}>
					<RuiSidebarGroupHeader
						label={
							<>
								<span class="rui-sidebar__group-icon">{section.icon}</span>
								<span>{section.title}</span>
							</>
						}
					/>
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
	</>
);

const DocsSiteHeader = ({ sidebarId }: { sidebarId: string }) => (
	<div class="rui-sidebar-provider__site-header-inner">
		<div class="rui-sidebar-provider__site-header-start">
			<RuiSidebarTrigger
				class="md:hidden"
				placement="header"
				controls={sidebarId}
				triggerLabel="Close documentation navigation"
			/>
			<RuiSidebarTrigger
				class="md:hidden"
				placement="inset"
				controls={sidebarId}
				triggerLabel="Open documentation navigation"
			/>
			<a class="rui-sidebar-provider__site-header-brand" href="/">
				Docs starter
			</a>
		</div>
		<nav class="rui-sidebar-provider__site-header-nav" aria-label="Site">
			<RuiButton
				href="https://github.com/ecopages/ecopages"
				target="_blank"
				rel="noopener noreferrer"
				variant="ghost"
				size="sm"
				aria-label="GitHub repository"
			>
				<svg viewBox="0 0 98 96" width="20" height="20" fill="currentColor" aria-hidden="true">
					<path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
				</svg>
			</RuiButton>
			<ThemeToggle id="toggle-dark-mode" label="Theme" data-eco-persist="theme-toggle" />
		</nav>
	</div>
);

type DocsShellProps = {
	nav: DocsNav;
	/**
	 * @remarks The sidebar persists across client navigation by this id, so each area of a site needs its own:
	 * a shared id would keep one area's sidebar on the other's pages.
	 */
	sidebarId: string;
	/** Breadcrumb and Copy for LLM, rendered above the page. */
	bar?: JsxRenderable;
	currentHref?: string;
	children: JsxRenderable;
};

const DocsShell = ({ nav, sidebarId, bar, currentHref, children }: DocsShellProps) => (
	<BaseLayout showHeader={false}>
		<RuiSidebarProvider
			layout="docs"
			class="docs-layout"
			siteHeader={<DocsSiteHeader sidebarId={sidebarId} />}
			sidebar={
				<RuiSidebar
					id={sidebarId}
					data={{ ecoPersist: sidebarId }}
					collapsible="off"
					defaultWidth={250}
					mobileBreakpoint={768}
					mobileDefaultOpen={false}
					label="Documentation navigation"
					matchActive
					scrollActiveOnMount
					navigationEvents={ECO_NAVIGATION_EVENTS}
				>
					<RuiSidebarContent aria-label="Documentation navigation">
						<DocsNavigation nav={nav} />
					</RuiSidebarContent>
				</RuiSidebar>
			}
		>
			<RuiSidebarInset>
				<div class="docs-layout__content">
					{bar}
					<div class="prose">{children}</div>
					<DocsPagination nav={nav} currentHref={currentHref} />
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

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		scripts: [{ src: './docs-layout.script.ts', ssr: true }],
		components: [DocsBar, CodeTabs],
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? getDocsLlmUrl(section, slug) : undefined;
		const crumbs = buildDocsCrumbs(docsNav, section, slug);
		const currentHref = section && slug ? `${docsNav.rootDir}/${section}/${slug}` : undefined;

		return (
			<DocsShell
				nav={docsNav}
				sidebarId={DOCS_SIDEBAR_ID}
				bar={<DocsBar crumbs={crumbs} llmUrl={llmUrl} />}
				currentHref={currentHref}
			>
				{children}
			</DocsShell>
		);
	},
});

export default DocsLayout;
