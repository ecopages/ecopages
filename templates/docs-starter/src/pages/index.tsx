import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiHeading, RuiHeadingDescription, RuiHeadingEyebrow, RuiHeadingTitle } from '@ecopages/radiant-ui/heading';
import { docsNav } from '@/content-nav';
import { BaseLayout } from '@/layouts/base-layout';

const docsIndexHref = docsNav.sections[0]?.items[0]?.href ?? '/docs/getting-started/introduction';
const writingHref =
	docsNav.sections.flatMap((section) => section.items).find((page) => page.slug === 'writing')?.href ??
	'/docs/guides/writing';

export default eco.page<{}, JsxRenderable>({
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./index.css'],
	},
	metadata: () => ({
		title: 'Docs starter',
		description: 'An Ecopages docs template with MDX pages, sidebar navigation, prose, and a theme toggle.',
		url: '/',
	}),
	render: () => (
		<div class="home-layout">
			<header class="home-hero">
				<RuiHeading size="xl" class="home-hero__heading">
					<RuiHeadingEyebrow>Documentation starter</RuiHeadingEyebrow>
					<RuiHeadingTitle as="h1">
						MDX docs with a sidebar, table of contents, and a theme toggle.
					</RuiHeadingTitle>
					<RuiHeadingDescription>
						Author pages under <code>src/content/docs</code>. One catch-all route renders every entry with
						breadcrumbs, copy-for-LLM, and previous/next pagination.
					</RuiHeadingDescription>
				</RuiHeading>
				<div class="home-hero__actions">
					<RuiButton href={docsIndexHref}>Read introduction</RuiButton>
					<RuiButton href={writingHref} variant="outline">
						See prose
					</RuiButton>
				</div>
			</header>

			<section class="home-path" aria-label="Start here">
				<RuiHeading as="header" size="sm">
					<RuiHeadingEyebrow>In this starter</RuiHeadingEyebrow>
					<RuiHeadingTitle as="h2">Start here</RuiHeadingTitle>
				</RuiHeading>
				<ol class="home-path__list">
					<li>Open a docs page and switch theme with the cycle toggle in the header.</li>
					<li>
						Add MDX under <code>src/content/docs/&lt;section&gt;/&lt;slug&gt;.mdx</code>.
					</li>
					<li>
						Register new sections in <code>DOCS_SECTION_ORDER</code>.
					</li>
				</ol>
				<div class="home-cards">
					{docsNav.sections.flatMap((section) =>
						section.items.map((page) => (
							<a href={page.href} class="home-card">
								<p class="home-card__section">{section.title}</p>
								<p class="home-card__title">{page.title}</p>
								<p class="home-card__description">{page.description}</p>
							</a>
						)),
					)}
				</div>
			</section>
		</div>
	),
});
