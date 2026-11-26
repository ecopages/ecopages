import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCollectionPage, listCollectionPaths, type CollectionPage } from '@/lib/catalog/queries.server';
import { categoryUrl, collectionUrl, subcategoryUrl } from '@/lib/catalog/urls';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

export default eco.page<CollectionPage, JsxRenderable>({
	layout: BaseLayout,
	paths: async () => (await listCollectionPaths(await getCatalogDb())).map((params) => ({ params })),
	props: async ({ params }) => {
		const page = await getCollectionPage(await getCatalogDb(), String(params.collection));
		if (!page) throw HttpError.NotFound('No such collection.');
		return page;
	},
	metadata: ({ props }) => ({
		title: `${props.collection.name} | Ecofaster`,
		description: props.collection.tagline,
		url: collectionUrl(props.collection),
	}),
	render: ({ collection, categories }) => (
		<>
			<Breadcrumbs crumbs={[{ label: 'Home', href: '/' }, { label: collection.name }]} />
			<header class="page-header">
				<h1>{collection.name}</h1>
				<p>{collection.tagline}</p>
			</header>
			{categories.map((category) => (
				<section class="catalog-section" aria-labelledby={`category-${category.slug}`}>
					<div class="catalog-section__header">
						<h2 id={`category-${category.slug}`}>{category.name}</h2>
						<a href={categoryUrl(collection, category)} data-eco-prefetch="viewport">
							See all {category.name.toLowerCase()}
						</a>
					</div>
					<ul class="chip-list">
						{category.subcategories.map((subcategory) => (
							<li>
								<a
									class="chip-link"
									href={subcategoryUrl(collection, category, subcategory)}
									data-eco-prefetch="viewport"
								>
									{subcategory.name}
								</a>
							</li>
						))}
					</ul>
				</section>
			))}
		</>
	),
});
