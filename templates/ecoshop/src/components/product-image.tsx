import type { JsxRenderable } from '@ecopages/jsx';
import type { Image } from '@/lib/commerce/types';
import { cx } from '@/lib/cx';

const WIDTHS = [320, 640, 960, 1280];

/**
 * Adds Shopify's `width` transform to a CDN image URL, or returns `null` for an image that has no transforms.
 */
function sized(url: string, width: number): string | null {
	const parsed = URL.parse(url);
	if (parsed?.hostname !== 'cdn.shopify.com') return null;
	parsed.searchParams.set('width', String(width));
	return parsed.toString();
}

export type ProductImageProps = {
	image: Image | null;
	alt: string;
	/** The `sizes` attribute for the responsive candidates. */
	sizes: string;
	eager?: boolean;
	class?: string;
};

/**
 * A product image with responsive candidates for Shopify CDN images and a neutral placeholder when there is none.
 */
export function ProductImage({ image, alt, sizes, eager = false, class: className }: ProductImageProps): JsxRenderable {
	if (!image) return <div class={cx('product-image product-image--empty', className)} role="img" aria-label={alt} />;

	const candidates = WIDTHS.map((width) => {
		const url = sized(image.url, width);
		return url ? `${url} ${width}w` : null;
	}).filter(Boolean);

	return (
		<img
			class={cx('product-image', className)}
			src={image.url}
			srcset={candidates.length ? candidates.join(', ') : undefined}
			sizes={candidates.length ? sizes : undefined}
			width={image.width ?? undefined}
			height={image.height ?? undefined}
			alt={image.altText ?? alt}
			loading={eager ? 'eager' : 'lazy'}
			fetchpriority={eager ? 'high' : undefined}
			decoding="async"
		/>
	);
}
