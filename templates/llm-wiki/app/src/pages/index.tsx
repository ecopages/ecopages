import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { CatalogSearchHero } from '@/components/catalog-search-hero';
import { wikiNav } from '@/content-nav';
import { DocsLayout } from '@/layouts/docs-layout';
import './index.css';

export default eco.page<{}, JsxRenderable>({
	layout: DocsLayout,
	dependencies: {
		components: [CatalogSearchHero],
	},
	metadata: () => ({
		title: 'Wiki',
		description: 'Catalog of wiki pages, grouped by category.',
		url: '/',
	}),
	render: () => (
		<div class="catalog-home">
			<header class="catalog-hero">
				<h1>Index</h1>
				<p>Catalog of wiki pages, grouped by category.</p>
				<CatalogSearchHero />
			</header>
			{wikiNav.sections.map((section) => (
				<>
					<h2>{section.title}</h2>
					<ul>
						{section.items.map((page) => (
							<li>
								<a href={page.href}>{page.title}</a>
								{` — ${page.summary}`}
							</li>
						))}
					</ul>
				</>
			))}
		</div>
	),
});
