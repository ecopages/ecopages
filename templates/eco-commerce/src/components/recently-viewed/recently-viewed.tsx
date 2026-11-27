import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { ProductJson } from '@/lib/storefront/json';
import './recently-viewed.css';

/** The visitor's recently viewed products; pass the page's product to remember it. */
export const RecentlyViewed = eco.component<{ product?: ProductJson }, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './recently-viewed.script.tsx', lazy: { 'on:idle': true } }],
	},
	render: ({ product }) => <recently-viewed attr:product={product ? JSON.stringify(product) : ''} />,
});
