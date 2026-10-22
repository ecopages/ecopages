import { postsService } from './posts.server';

const FEED_SIZE = 20;

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

/** RSS 2.0 document of the latest published posts, with absolute links under `origin`. */
export async function buildFeed(origin: string): Promise<string> {
	const posts = await postsService.listPublished(1, FEED_SIZE);
	const items = posts.map((post) => {
		const link = new URL(`/posts/${post.slug}`, origin).href;
		return [
			'<item>',
			`<title>${escapeXml(post.title)}</title>`,
			`<link>${escapeXml(link)}</link>`,
			`<guid isPermaLink="true">${escapeXml(link)}</guid>`,
			`<pubDate>${post.published_at.toUTCString()}</pubDate>`,
			post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : '',
			'</item>',
		].join('');
	});

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		'<channel>',
		'<title>EcoBlog</title>',
		`<link>${escapeXml(new URL('/', origin).href)}</link>`,
		'<description>Notes on building for the web with less JavaScript.</description>',
		'<language>en</language>',
		`<atom:link href="${escapeXml(new URL('/feed.xml', origin).href)}" rel="self" type="application/rss+xml" />`,
		posts[0] ? `<lastBuildDate>${posts[0].published_at.toUTCString()}</lastBuildDate>` : '',
		...items,
		'</channel>',
		'</rss>',
	].join('');
}
