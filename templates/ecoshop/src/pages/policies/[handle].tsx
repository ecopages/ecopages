import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { CATALOG_REVALIDATE_SECONDS } from '@/lib/commerce/cache-tags';
import { getCommerce } from '@/lib/commerce/provider.server';
import type { StorePolicy } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import { StoreLayout } from '@/layouts/store-layout/store-layout';

/**
 * A store policy or the FAQ, the pages the `ask_business` tool links to.
 */
export default eco.page<{ policy: StorePolicy }, JsxRenderable>({
	layout: StoreLayout,
	cache: { revalidate: CATALOG_REVALIDATE_SECONDS },
	paths: async () => {
		const policies = await getCommerce().listPolicies();
		return policies.map((policy) => ({ params: { handle: policy.handle } }));
	},
	props: async ({ params }) => {
		const policies = await getCommerce().listPolicies();
		const policy = policies.find((entry) => entry.handle === String(params.handle));
		if (!policy) throw HttpError.NotFound('Policy not found');
		return { policy };
	},
	metadata: ({ props }) => ({
		title: props.policy.title,
		description: props.policy.body.slice(0, 160),
		url: storePaths.policy(props.policy.handle),
	}),
	render: ({ policy }) => (
		<article class="flex max-w-prose flex-col gap-4">
			<h1 class="page-title">{policy.title}</h1>
			{policy.body.split(/\n\s*\n/u).map((paragraph) => (
				<p class="leading-relaxed">{paragraph}</p>
			))}
		</article>
	),
});
