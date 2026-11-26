import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { listCollections, type CollectionWithCategories } from '@/lib/catalog/queries.server';
import { categoryUrl, collectionUrl } from '@/lib/catalog/urls';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

type HomeProps = {
	collections: CollectionWithCategories[];
};

export default eco.page<HomeProps, JsxRenderable>({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Ecofaster',
		description:
			'Browse home goods by collection: static pages, instant navigation, a cart that works without JavaScript.',
	}),
	props: async () => ({ collections: await listCollections(await getCatalogDb()) }),
	render: ({ collections }) => (
		<>
			<header class="page-header">
				<h1>Everything for the home</h1>
				<p>
					Pick a collection, then narrow it down. Every listing is a static page, prefetched before you click.
				</p>
			</header>
			{collections.map((collection) => (
				<section class="catalog-section" aria-labelledby={`collection-${collection.slug}`}>
					<div class="catalog-section__header">
						<h2 id={`collection-${collection.slug}`}>{collection.name}</h2>
						<a href={collectionUrl(collection)} data-eco-prefetch="viewport">
							Browse {collection.name.toLowerCase()}
						</a>
					</div>
					<ul class="tile-list">
						{collection.categories.map((category) => (
							<li>
								<a class="tile" href={categoryUrl(collection, category)} data-eco-prefetch="viewport">
									<span class="tile__title">{category.name}</span>
									<span class="tile__meta">{collection.name}</span>
								</a>
							</li>
						))}
					</ul>
				</section>
			))}
		</>
	),
});
