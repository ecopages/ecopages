import type { StandardSchema } from '@ecopages/core';
import type { EntryComparator } from './sort.ts';

/**
 * Declares one content collection scanned at build time.
 * Collection keys become virtual module paths: `ecopages:content/<key>`.
 */
export type ContentCollectionDefinition<TFrontmatter extends Record<string, unknown> = Record<string, unknown>> = {
	/** Directory relative to the app `srcDir`, e.g. `content/docs`. */
	contentDir: string;
	/** Standard Schema validator for frontmatter (Zod, Valibot, ArkType, etc.). */
	schema: StandardSchema<unknown, TFrontmatter>;
	orderBy?: EntryComparator<TFrontmatter>;
	/** File extensions treated as content. Defaults to `['.mdx']`. */
	extensions?: string[];
	/**
	 * Frontmatter type for generated `ecopages:content/<collection>` modules.
	 * The processor wraps it with {@link ContentEntry} (`slug` and `segments` come from the library).
	 * Format: `./path/to/schema-file#ExportedTypeName`
	 */
	entryType?: string;
	/**
	 * Public URL prefix for entries in this collection, e.g. `/docs`.
	 * Used with {@link ContentDevPrewarmConfig} to build dev prewarm paths.
	 */
	routePrefix?: string;
	/**
	 * Which entries to SSR-prewarm in dev when {@link routePrefix} is set.
	 * Rendering is performed by core; this only declares pathnames from the manifest.
	 */
	devPrewarm?: ContentDevPrewarmConfig;
	/**
	 * When `beforeReady`, core awaits SSR prewarm for declared paths before the dev server reports ready.
	 * @default 'background'
	 */
	devPrewarmReadiness?: 'background' | 'beforeReady';
};

/** Dev prewarm selection for a content collection manifest. */
export type ContentDevPrewarmConfig =
	| 'first'
	| 'all'
	| { slugs: readonly string[] }
	| { limit: number };

/**
 * Collection registry keyed by collection name.
 */
export type ContentCollectionsConfig = Record<string, ContentCollectionDefinition>;

export type ContentProcessorConfig = {
	collections: ContentCollectionsConfig;
};
