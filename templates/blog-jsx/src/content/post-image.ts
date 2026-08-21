import type { ImageSpecifications } from '@ecopages/image-processor';
import {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';
import type { PostImageImport } from './post-image-imports';

export type { PostImageImport } from './post-image-imports';

const postImages = {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} as const satisfies Record<PostImageImport, ImageSpecifications>;

/**
 * Resolves a frontmatter `image` import name to processed image specs for `EcoImage`.
 *
 * @remarks
 * Uses explicit named imports from `ecopages:images` so only referenced images enter
 * the page graph. Keep this module out of `eco.config.ts` import chains.
 */
export function resolvePostImage(importName: PostImageImport): ImageSpecifications {
	return postImages[importName];
}
