import type { ContentEntry } from './types.ts';
import type { ContentCollectionDefinition, ContentDevPrewarmConfig } from './collection-types.ts';

/**
 * Resolves entry slugs to prewarm for one collection from processor config.
 */
export function resolveContentDevPrewarmSlugs<T extends Record<string, unknown>>(
	config: ContentDevPrewarmConfig,
	entries: readonly ContentEntry<T>[],
): string[] {
	if (config === 'first') {
		const first = entries[0];
		return first ? [first.slug] : [];
	}

	if (config === 'all') {
		return entries.map((entry) => entry.slug);
	}

	if ('slugs' in config) {
		return [...config.slugs];
	}

	if ('limit' in config) {
		return entries.slice(0, Math.max(0, config.limit)).map((entry) => entry.slug);
	}

	return [];
}

/**
 * Builds absolute URL pathnames for dev prewarm from collection config and manifest order.
 */
export function buildContentDevPrewarmPathnames<T extends Record<string, unknown>>(
	definition: Pick<ContentCollectionDefinition<T>, 'routePrefix' | 'devPrewarm'>,
	entries: readonly ContentEntry<T>[],
): string[] {
	if (!definition.devPrewarm || !definition.routePrefix) {
		return [];
	}

	const prefix = definition.routePrefix.replace(/\/$/, '');
	const slugs = resolveContentDevPrewarmSlugs(definition.devPrewarm, entries);

	return slugs.map((slug) => `${prefix}/${slug}`.replace(/\/{2,}/g, '/'));
}
