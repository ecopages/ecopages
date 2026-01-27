import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import { HttpError } from '@ecopages/core/errors';
import appConfig from './eco.config';
import { PostView } from './src/views/post-view.kita';
import { PostListView } from './src/views/post-list-view.kita';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { posts } from './src/data';

const app = new EcopagesApp({ appConfig });

app.static('/', PostListView)
	.static('/posts', PostListView)
	.static('/posts/:slug', PostView)
	.get('/latest', async (ctx) => {
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
