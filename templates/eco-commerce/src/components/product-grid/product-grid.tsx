import type { JsxRenderable } from '@ecopages/jsx';
import type { ProductCard as ProductCardData } from '@/lib/commerce/types';
import { ProductCard } from '@/components/product-card/product-card';
import './product-grid.css';

export type ProductGridProps = {
	products: ProductCardData[];
	/** Cards whose image loads eagerly: the ones above the fold. */
	eagerCount?: number;
	label?: string;
};

export function ProductGrid({ products, eagerCount = 0, label }: ProductGridProps): JsxRenderable {
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
