import type { JsxRenderable } from '@ecopages/jsx';
import { RuiBadge } from '@ecopages/radiant-ui/badge';
import { formatMoney } from '@/lib/commerce/money';
import type { ProductCard as ProductCardData } from '@/lib/commerce/types';
import { productUrl } from '@/lib/storefront/urls';
import './product-card.css';

export type ProductCardProps = {
	product: ProductCardData;
	/** Loads the image at once; set it for cards above the fold. */
	eager?: boolean;
};

/**
 * @remarks
 * The link asks the browser router to prefetch on viewport entry (`data-eco-prefetch="viewport"`), so a product
 * page is usually in memory before the visitor clicks. Cards, the typeahead and the product page share one image
 * URL, so the product image is already cached when its page opens.
 */
export function ProductCard({ product, eager = false }: ProductCardProps): JsxRenderable {
	return (
		<a class="product-card" href={productUrl(product)} data-eco-prefetch="viewport">
			<span class="product-card__media">
				<img
					src={product.thumbnail}
					alt=""
					width={400}
					height={400}
					loading={eager ? 'eager' : 'lazy'}
					decoding="async"
				/>
				{product.badge ? (
					<RuiBadge class="product-card__badge" variant={product.badge === 'sale' ? 'destructive' : 'filled'}>
						{product.badge === 'sale' ? 'Sale' : 'New'}
					</RuiBadge>
				) : null}
			</span>
			<span class="product-card__title">{product.title}</span>
			<span class="product-card__price">
				{formatMoney(product.price)}
				{product.compareAtPrice ? <s class="product-card__was">{formatMoney(product.compareAtPrice)}</s> : null}
			</span>
		</a>
	);
}
