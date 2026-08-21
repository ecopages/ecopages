import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ContentScanner } from '@ecopages/content-processor';
import type { EntryComparator } from '@ecopages/content-processor';
import type { z } from 'zod';

export type RssPostFrontmatter = {
	title: string;
	description: string;
	date: string;
};

export type GenerateRssChannel = {
	title: string;
	description: string;
	link?: string;
};

export type GenerateRssOptions<TFrontmatter extends RssPostFrontmatter = RssPostFrontmatter> = {
	appRoot: string;
	baseUrl: string;
	channel: GenerateRssChannel;
	contentRoot: string;
	schema: z.ZodType<TFrontmatter>;
	orderBy: EntryComparator;
	postPathPrefix?: string;
	outputPath?: string;
};

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function buildPostLink(baseUrl: string, postPathPrefix: string, slug: string): string {
	const prefix = postPathPrefix.startsWith('/') ? postPathPrefix : `/${postPathPrefix}`;
	const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

	return new URL(`${normalizedPrefix}/${slug}`, baseUrl).href;
}

export async function generateRss<TFrontmatter extends RssPostFrontmatter>({
	appRoot,
	baseUrl,
	channel,
	contentRoot,
	schema,
	orderBy,
	postPathPrefix = '/posts',
	outputPath,
}: GenerateRssOptions<TFrontmatter>): Promise<void> {
	const scanner = new ContentScanner<TFrontmatter>({
		contentRoot,
		schema,
		orderBy,
	});
	const entries = await scanner.getManifest();
	const items = entries
		.map((entry) => {
			const link = buildPostLink(baseUrl, postPathPrefix, entry.slug);
			const pubDate = new Date(`${entry.date}T00:00:00Z`).toUTCString();
			return `    <item>
		<title>${escapeXml(entry.title)}</title>
		<link>${escapeXml(link)}</link>
		<description>${escapeXml(entry.description)}</description>
		<pubDate>${pubDate}</pubDate>
	</item>`;
		})
		.join('\n\n');
	const channelLink = channel.link ?? new URL('/', baseUrl).href;
	const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(channel.description)}</description>

${items}
  </channel>
</rss>
`;
	const resolvedOutputPath = outputPath ?? path.join(appRoot, 'src', 'public', 'rss.xml');

	await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
	await writeFile(resolvedOutputPath, xml, 'utf8');

	console.log(`RSS feed written to ${resolvedOutputPath}`);
}
