/** Named exports from `ecopages:images` allowed in post frontmatter. */
export const POST_IMAGE_IMPORTS = [
	'ezi76Gu53NklsuUnsplashJpg',
	'theodorePoncetQzephogqd7WUnsplashJpg',
	'urbanVintage78A265Wpio4UnsplashJpg',
] as const;

export type PostImageImport = (typeof POST_IMAGE_IMPORTS)[number];
