import { createApp } from '@ecopages/core/create-app';
import { HttpError } from '@ecopages/core/errors';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { posts } from './src/data';

const app = await createApp();

app.static('/', './src/views/post-list-view.kita')
	.static('/posts', './src/views/post-list-view.kita')
	.static('/posts/:slug', './src/views/post-view.kita')
	.get('/latest', async (ctx) => {
		const latestPost = posts[posts.length - 1];
		return ctx.renderServerModule(new URL('./src/views/post-view.kita', import.meta.url), latestPost);
	})
	.add(api.list)
	.add(api.detail)
	.group(adminGroup)
	.notFound('./src/views/not-found-view.kita')
	.serverError('./src/views/server-error-view.kita');

app.onError((error, ctx) => {
	if (error instanceof HttpError) {
		return ctx.json(error.toJSON(), { status: error.status });
	}
	console.error('Unexpected error:', error);
	return ctx.json({ error: 'Internal Server Error' }, { status: 500 });
});

await app.start();
