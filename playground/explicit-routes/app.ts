import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import { HttpError } from '@ecopages/core/errors';
import appConfig from './eco.config';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { posts } from './src/data';

const app = new EcopagesApp({ appConfig });

app.static('/', () => import('./src/views/post-list-view.kita'))
	.static('/posts', () => import('./src/views/post-list-view.kita'))
	.static('/posts/:slug', () => import('./src/views/post-view.kita'))
	.get('/latest', async (ctx) => {
		const { default: PostView } = await import('./src/views/post-view.kita');
		const latestPost = posts[posts.length - 1];
		return ctx.render(PostView, latestPost);
	})
	.get(api.list)
	.get(api.detail)
	.group(adminGroup);

app.onError((error, ctx) => {
	if (error instanceof HttpError) {
		return ctx.json(error.toJSON(), { status: error.status });
	}
	console.error('Unexpected error:', error);
	return ctx.json({ error: 'Internal Server Error' }, { status: 500 });
});

await app.start();
