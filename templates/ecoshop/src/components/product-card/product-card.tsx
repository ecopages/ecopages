import type { JsxRenderable } from '@ecopages/jsx';
import { RuiBadge } from '@ecopages/radiant-ui/badge';
import { ProductImage } from '@/components/product-image';
import { formatPriceRange } from '@/lib/commerce/money';
import type { ProductSummary } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import './product-card.css';

export function ProductCard({ product, eager = false }: { product: ProductSummary; eager?: boolean }): JsxRenderable {
	return (
		<article class="product-card">
			<a class="product-card__link" href={storePaths.product(product.handle)}>
				<div class="product-card__media">
					<ProductImage
						image={product.featuredImage}
						alt={product.title}
						sizes="(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 90vw"
						eager={eager}
					/>
					{product.availableForSale ? null : (
						<RuiBadge variant="muted" class="product-card__badge">
							Sold out
						</RuiBadge>
					)}
				</div>
				<h3 class="product-card__title">{product.title}</h3>
			</a>
			<p class="product-card__price">{formatPriceRange(product.priceRange)}</p>
		</article>
	);
}

export function ProductGrid({
	products,
	label,
	eagerCount = 0,
}: {
	products: ProductSummary[];
	label: string;
	eagerCount?: number;
}): JsxRenderable {
	return (
		<ul class="product-grid" aria-label={label}>
			{products.map((product, index) => (
				<li>
					<ProductCard product={product} eager={index < eagerCount} />
				</li>
			))}
		</ul>
	);
}
