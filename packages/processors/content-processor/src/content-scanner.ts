import { join, relative, resolve, sep } from 'node:path';
import { validateStandardSchema, type StandardSchema } from '@ecopages/core';
import { VFile } from 'vfile';
import { matter } from 'vfile-matter';
import { fileSystem } from '@ecopages/file-system';
import { compareEntriesBySlug, type EntryComparator } from './sort.ts';
import type { ContentEntry } from './types.ts';

export type ContentScannerConfig<T extends Record<string, unknown> = Record<string, unknown>> = {
	/** Absolute directory scanned for content files. */
	contentRoot: string;
	/**
	 * Extensions scanned for content entries, including multi-dot ones.
	 *
	 * @remarks
	 * Declaration order does not matter: extensions are matched longest-first so
	 * `.radiant.mdx` and `.react.mdx` strip cleanly even when a plain `.mdx`
	 * entry is also declared in the same collection.
	 */
	extensions?: string[];
	orderBy?: EntryComparator<T>;
	schema: StandardSchema<unknown, T>;
};

type ContentCache<T extends Record<string, unknown>> = {
	manifest: ContentEntry<T>[];
	filePathsBySlug: Map<string, string>;
};

export type ContentEntryPathUpdateResult = 'no-op' | 'manifest' | 'structure';

/**
 * Strips the longest matching declared extension from a relative path.
 *
 * @remarks
 * `extensions` must be longest-first. `ContentScanner` sorts its configured
 * extensions that way before calling this helper.
 */
function slugFromRelativePath(relativePath: string, extensions: string[]): string {
	for (const ext of extensions) {
		if (relativePath.endsWith(ext)) {
			return relativePath.slice(0, -ext.length).split(sep).join('/');
		}
	}
	return relativePath.split(sep).join('/');
}

/**
 * Scans a content directory and exposes manifest metadata plus source file paths.
 * Used by the content processor at build time; it does not belong in page bundles.
 */
export class ContentScanner<T extends Record<string, unknown> = Record<string, unknown>> {
	private readonly contentRoot: string;
	private readonly extensions: string[];
	private readonly orderBy: EntryComparator<T>;
	private readonly schema: StandardSchema<unknown, T>;
	private cachePromise?: Promise<ContentCache<T>>;

	constructor(config: ContentScannerConfig<T>) {
		this.contentRoot = config.contentRoot;
		this.extensions = [...(config.extensions ?? ['.mdx'])].sort((left, right) => right.length - left.length);
		this.orderBy = config.orderBy ?? compareEntriesBySlug;
		this.schema = config.schema;
	}

	clearCache(): void {
		this.cachePromise = undefined;
	}

	private async parseFrontmatter(raw: string): Promise<T> {
		const file = new VFile({ value: raw });
		matter(file);
		return validateStandardSchema(this.schema, file.data.matter);
	}

	private async loadCache(): Promise<ContentCache<T>> {
		const patterns = this.extensions.map((ext) => `**/*${ext}`);
		const relativePaths = await fileSystem.glob(patterns, { cwd: this.contentRoot });

		const files = await Promise.all(
			relativePaths.map(async (relativePath) => {
				const filePath = join(this.contentRoot, relativePath);
				const slug = slugFromRelativePath(relativePath, this.extensions);
				const raw = await fileSystem.readFile(filePath);
				const entry: ContentEntry<T> = {
					...(await this.parseFrontmatter(raw)),
					slug,
					segments: slug.split('/'),
				};
				return {
					filePath,
					entry,
				};
			}),
		);

		files.sort((a, b) => this.orderBy(a.entry, b.entry));

		const filePathsBySlug = new Map<string, string>();
		for (const { entry, filePath } of files) {
			filePathsBySlug.set(entry.slug, filePath);
		}

		return {
			manifest: files.map((file) => file.entry),
			filePathsBySlug,
		};
	}

	private async getCache(): Promise<ContentCache<T>> {
		if (!this.cachePromise) {
			this.cachePromise = this.loadCache();
		}
		return this.cachePromise;
	}

	async getManifest(): Promise<ContentEntry<T>[]> {
		return (await this.getCache()).manifest;
	}

	async getRawContent(slug: string): Promise<string> {
		const cache = await this.getCache();
		const filePath = cache.filePathsBySlug.get(slug);
		if (!filePath) {
			throw new Error(`Unknown content entry: ${slug}`);
		}
		return fileSystem.readFile(filePath);
	}

	async getEntrySources(): Promise<Array<{ entry: ContentEntry<T>; filePath: string }>> {
		const cache = await this.getCache();
		return cache.manifest.map((entry) => ({
			entry,
			filePath: cache.filePathsBySlug.get(entry.slug)!,
		}));
	}

	/**
	 * Re-parses one content file and updates the in-memory manifest.
	 *
	 * @remarks
	 * Returns `no-op` when only the MDX body changed so callers can skip
	 * rewriting generated collection modules during dev HMR.
	 */
	async updateEntryForPath(filePath: string, event: 'change' | 'delete'): Promise<ContentEntryPathUpdateResult> {
		const resolvedPath = resolve(filePath);
		const cache = await this.getCache();

		if (event === 'delete') {
			return this.removeEntryAtPath(cache, resolvedPath);
		}

		const relativePath = relative(this.contentRoot, resolvedPath);
		const nextSlug = slugFromRelativePath(relativePath, this.extensions);
		const previousSlug = this.findSlugForFilePath(cache, resolvedPath);

		return this.upsertEntryAtPath(cache, resolvedPath, nextSlug, previousSlug);
	}

	private findSlugForFilePath(cache: ContentCache<T>, filePath: string): string | undefined {
		for (const [slug, currentPath] of cache.filePathsBySlug) {
			if (resolve(currentPath) === filePath) {
				return slug;
			}
		}

		return undefined;
	}

	private removeEntryAtPath(cache: ContentCache<T>, filePath: string): ContentEntryPathUpdateResult {
		const slug = this.findSlugForFilePath(cache, filePath);
		if (!slug) {
			return 'no-op';
		}

		cache.filePathsBySlug.delete(slug);
		cache.manifest = cache.manifest.filter((entry) => entry.slug !== slug);
		return 'structure';
	}

	private async upsertEntryAtPath(
		cache: ContentCache<T>,
		filePath: string,
		nextSlug: string,
		previousSlug: string | undefined,
	): Promise<ContentEntryPathUpdateResult> {
		const raw = await fileSystem.readFile(filePath);
		const nextEntry: ContentEntry<T> = {
			...(await this.parseFrontmatter(raw)),
			slug: nextSlug,
			segments: nextSlug.split('/'),
		};

		if (!previousSlug) {
			cache.manifest.push(nextEntry);
			cache.filePathsBySlug.set(nextSlug, filePath);
			cache.manifest.sort((left, right) => this.orderBy(left, right));
			return 'structure';
		}

		const previousEntry = cache.manifest.find((entry) => entry.slug === previousSlug);
		if (!previousEntry) {
			cache.manifest.push(nextEntry);
			cache.filePathsBySlug.set(nextSlug, filePath);
			cache.manifest.sort((left, right) => this.orderBy(left, right));
			return 'structure';
		}

		const entryMatches = JSON.stringify(previousEntry) === JSON.stringify(nextEntry);
		if (entryMatches) {
			return 'no-op';
		}

		cache.manifest = cache.manifest.map((entry) => (entry.slug === previousSlug ? nextEntry : entry));
		cache.filePathsBySlug.set(nextSlug, filePath);
		cache.manifest.sort((left, right) => this.orderBy(left, right));

		return 'manifest';
	}
}
