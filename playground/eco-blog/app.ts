import { createApp } from '@ecopages/core/create-app';
import { buildFeed } from './src/lib/feed.server';

const app = await createApp();

/**
 * @remarks
 * `/feed.xml` ends in a static file extension, which file routes never answer, so the feed is an Explicit Route.
 */
app.get('/feed.xml', async ({ request }) => {
	const origin = process.env.ECOPAGES_BASE_URL ?? new URL(request.url).origin;
	return new Response(await buildFeed(origin), {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
});

await app.start();
