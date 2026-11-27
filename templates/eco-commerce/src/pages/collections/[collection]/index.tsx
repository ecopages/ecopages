import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { CatalogTree } from '@/components/catalog-tree/catalog-tree';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import type { CollectionDetail } from '@/lib/commerce/types';
import { pageTitle } from '@/lib/store';
import { collectionUrl } from '@/lib/storefront/urls';

export default eco.page<{ collection: CollectionDetail }, JsxRenderable>({
	layout: {
		component: BaseLayout,
		props: ({ params }) => ({ place: { collection: String(params?.collection ?? '') } }),
	},
	paths: async () =>
		(await getCommerceBackend().catalog.listCatalogPaths()).collections.map((params) => ({ params })),
	props: async ({ params }) => {
		const collection = await getCommerceBackend().catalog.getCollection(String(params.collection));
		if (!collection) throw HttpError.NotFound('No such collection.');
		return { collection };
	},
	metadata: ({ props }) => ({
		title: pageTitle(props.collection.name),
		description: props.collection.tagline,
		url: collectionUrl(props.collection),
	}),
	render: ({ collection }) => (
		<>
			<Breadcrumbs crumbs={[{ label: 'Home', href: '/' }, { label: collection.name }]} />
			<header class="page-header">
				<h1>{collection.name}</h1>
				<p>{collection.tagline}</p>
			</header>
			<CatalogTree collection={collection} eagerCount={12} />
		</>
	),
});
