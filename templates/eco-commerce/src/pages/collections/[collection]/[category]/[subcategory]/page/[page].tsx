import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { SubcategoryListing } from '@/components/subcategory-listing/subcategory-listing';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { resolveBuildPolicy } from '@/lib/storefront/build-policy';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { pageTitle } from '@/lib/store';
import {
	listListingPagePaths,
	loadSubcategoryPage,
	type SubcategoryPageProps,
} from '@/lib/storefront/subcategory-page.server';
import { subcategoryUrl } from '@/lib/storefront/urls';

/**
 * @remarks
 * Pages 2 and later of a subcategory. The build renders as many as `resolveBuildPolicy` says;
 * later ones render on their first request and are cached like the others.
 */
export default eco.page<SubcategoryPageProps, JsxRenderable>({
	cache: { revalidate: 3600, tags: ['catalog'] },
	layout: {
		component: BaseLayout,
		props: ({ params }) => ({
			place: { collection: String(params?.collection ?? ''), category: String(params?.category ?? '') },
		}),
	},
	paths: async () => {
		const policy = resolveBuildPolicy();
		const paths = await listListingPagePaths(getCommerceBackend().catalog, policy.listingPagesPerSubcategory);
		return paths.map((params) => ({ params }));
	},
	props: async ({ params }) => {
		const page = Number(params.page);
		if (!Number.isSafeInteger(page) || page < 2) throw HttpError.NotFound('No such page.');
		return loadSubcategoryPage(
			getCommerceBackend().catalog,
			{
				collection: String(params.collection),
				category: String(params.category),
				subcategory: String(params.subcategory),
			},
			page,
		);
	},
	metadata: ({ props }) => ({
		title: pageTitle(`${props.detail.subcategory.name}, page ${props.results.page}`),
		description: `${props.detail.subcategory.name} in ${props.detail.category.name}, page ${props.results.page}.`,
		url: subcategoryUrl(
			props.detail.collection,
			props.detail.category,
			props.detail.subcategory,
			props.results.page,
		),
	}),
	render: (props) => <SubcategoryListing {...props} />,
});
