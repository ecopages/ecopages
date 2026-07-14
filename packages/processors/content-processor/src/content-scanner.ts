import { join, sep } from 'node:path';
import { validateStandardSchema, type StandardSchema } from '@ecopages/core';
import { VFile } from 'vfile';
import { matter } from 'vfile-matter';
import { fileSystem } from '@ecopages/file-system';
import { compareEntriesBySlug, type EntryComparator } from './sort.ts';
import type { ContentEntry } from './types.ts';

export type ContentScannerConfig<T extends Record<string, unknown> = Record<string, unknown>> = {
	/** Absolute directory scanned for content files. */
	contentRoot: string;
	/** Standard Schema validator for frontmatter. */
	schema: StandardSchema<unknown, T>;
	orderBy?: EntryComparator<T>;
	extensions?: string[];
};

type ContentCache<T extends Record<string, unknown>> = {
	manifest: ContentEntry<T>[];
	filePathsBySlug: Map<string, string>;
};

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
	private readonly extensions: string[];
	private readonly orderBy: EntryComparator<T>;
	private readonly schema: StandardSchema<unknown, T>;
	private cachePromise?: Promise<ContentCache<T>>;

	constructor(private readonly config: ContentScannerConfig<T>) {
		this.extensions = config.extensions ?? ['.mdx'];
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
		const relativePaths = await fileSystem.glob(patterns, { cwd: this.config.contentRoot });

		const files = await Promise.all(
			relativePaths.map(async (relativePath) => {
				const filePath = join(this.config.contentRoot, relativePath);
				const slug = slugFromRelativePath(relativePath, this.extensions);
				const raw = await fileSystem.readFile(filePath);
				const entry: ContentEntry<T> = {
					...(await this.parseFrontmatter(raw)),
					slug,
					segments: slug.split('/'),
				};
				return { filePath, entry };
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
}
