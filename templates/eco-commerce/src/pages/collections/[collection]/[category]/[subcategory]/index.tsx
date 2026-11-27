import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { SubcategoryListing } from '@/components/subcategory-listing/subcategory-listing';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { pageTitle } from '@/lib/store';
import { loadSubcategoryPage, type SubcategoryPageProps } from '@/lib/storefront/subcategory-page.server';
import { subcategoryUrl } from '@/lib/storefront/urls';

export default eco.page<SubcategoryPageProps, JsxRenderable>({
	layout: {
		component: BaseLayout,
		props: ({ params }) => ({
			place: { collection: String(params?.collection ?? ''), category: String(params?.category ?? '') },
		}),
	},
	paths: async () =>
		(await getCommerceBackend().catalog.listCatalogPaths()).subcategories.map(({ productCount: _, ...params }) => ({
			params,
		})),
	props: async ({ params }) =>
		loadSubcategoryPage(
			getCommerceBackend().catalog,
			{
				collection: String(params.collection),
				category: String(params.category),
				subcategory: String(params.subcategory),
			},
			1,
		),
	metadata: ({ props }) => ({
		title: pageTitle(props.detail.subcategory.name),
		description: `${props.results.total} ${props.detail.subcategory.name.toLowerCase()} in ${props.detail.category.name}.`,
		url: subcategoryUrl(props.detail.collection, props.detail.category, props.detail.subcategory),
	}),
	render: (props) => <SubcategoryListing {...props} />,
});
