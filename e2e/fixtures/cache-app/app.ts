import { EcopagesApp } from '../../../packages/core/src/adapters/bun/create-app';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

app.post('/api/revalidate', async ({ request, services }) => {
	const body = (await request.json()) as { tags?: string[]; paths?: string[]; clear?: boolean };

	if (!services.cache) {
		return Response.json({ error: 'Cache service not available' }, { status: 503 });
	}

	if (body.clear) {
		await services.cache.clear();
		return Response.json({ cleared: true });
	}

	let tagCount = 0;
	let pathCount = 0;

	if (body.tags?.length) {
		tagCount = await services.cache.invalidateByTags(body.tags);
	}

	if (body.paths?.length) {
		pathCount = await services.cache.invalidateByPaths(body.paths);
	}

	return Response.json({
		revalidated: true,
		invalidated: { tags: tagCount, paths: pathCount },
	});
});

app.get('/api/cache-stats', async ({ services }) => {
	if (!services.cache) {
		return Response.json({ error: 'Cache service not available' }, { status: 503 });
	}

	const stats = await services.cache.stats();
	return Response.json(stats);
});

await app.start();
