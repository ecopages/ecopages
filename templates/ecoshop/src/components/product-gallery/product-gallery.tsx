import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiCarousel } from '@ecopages/radiant-ui/carousel';
import { ProductImage } from '@/components/product-image';
import type { Image } from '@/lib/commerce/types';
import './product-gallery.css';

const SIZES = '(min-width: 64rem) 36rem, 100vw';

/**
 * The product images: a Radiant UI carousel when there are several, one image otherwise.
 */
export const ProductGallery = eco.component<{ images: Image[]; title: string }, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './product-gallery.script.ts', lazy: { 'on:visible': true } }],
	},
	render: ({ images, title }) => {
		if (images.length < 2) {
			return (
				<div class="product-gallery">
					<ProductImage
						image={images[0] ?? null}
						alt={title}
						sizes={SIZES}
						eager
						class="product-gallery__image"
					/>
				</div>
			);
		}
		return (
			<div class="product-gallery">
				<RuiCarousel
					label={`${title} images`}
					showIndicators
					slides={images.map((image, index) => ({
						id: `image-${index + 1}`,
						children: (
							<ProductImage
								image={image}
								alt={image.altText ?? `${title}, image ${index + 1} of ${images.length}`}
								sizes={SIZES}
								eager={index === 0}
								class="product-gallery__image"
							/>
						),
					}))}
				/>
			</div>
		);
	},
});
