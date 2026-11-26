import type { JsxRenderable } from '@ecopages/jsx';
import { formatPrice, productImageUrl, productUrl } from '@/lib/catalog/urls';
import type { ProductSummary } from '@/lib/catalog/types';
import './product-grid.css';

export type ProductGridProps = {
	products: ProductSummary[];
	/**
	 * Cards whose image loads eagerly; the rest load as they near the viewport.
	 *
	 * @remarks
	 * Set it to the cards above the fold on a listing page, so the first images are not delayed by lazy loading.
	 */
	eagerCount?: number;
	label?: string;
};

/**
 * @remarks
 * Each card link asks the browser router to prefetch on viewport entry (`data-eco-prefetch="viewport"`), so a
 * product page is usually in memory before the visitor clicks. A product page that was not built renders once on
 * its first request, prefetch included, and is then served from the page cache.
 */
export function ProductGrid({ products, eagerCount = 0, label }: ProductGridProps): JsxRenderable {
	return (
		<ul class="product-grid" aria-label={label}>
			{products.map((product, index) => (
				<li>
					<a class="product-card" href={productUrl(product)} data-eco-prefetch="viewport">
						<img
							class="product-card__image"
							src={productImageUrl(product)}
							alt=""
							width={400}
							height={400}
							loading={index < eagerCount ? 'eager' : 'lazy'}
							decoding="async"
						/>
						<span class="product-card__name">{product.name}</span>
						<span class="product-card__price">{formatPrice(product.priceCents)}</span>
					</a>
				</li>
			))}
		</ul>
	);
}
