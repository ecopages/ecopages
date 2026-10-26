import { createApp } from '@ecopages/core/create-app';
import { HttpError } from '@ecopages/core/errors';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { posts } from './src/data';
import PostListView from './src/views/post-list-view.kita.tsx';
import PostView from './src/views/post-view.kita.tsx';
import BoomView from './src/views/boom-view.kita.tsx';
import ForbiddenView from './src/views/forbidden-view.kita.tsx';
import NotFoundView from './src/views/not-found-view.kita.tsx';
import ForbiddenErrorView from './src/views/forbidden-error-view.kita.tsx';
import ServerErrorView from './src/views/server-error-view.kita.tsx';

const app = await createApp();

app.static('/', PostListView)
	.static('/posts', PostListView)
	.static('/posts/:slug', PostView)
	.static('/boom', BoomView)
	.static('/forbidden', ForbiddenView)
	.get('/latest', async (ctx) => {
		const latestPost = posts[posts.length - 1];
		return ctx.render(PostView, latestPost);
	})
	.add(api.list)
	.add(api.detail)
	.group(adminGroup)
	.notFound(NotFoundView)
	.forbidden(ForbiddenErrorView)
	.serverError(ServerErrorView);

app.onError((error, ctx) => {
	if (error instanceof HttpError) {
		return ctx.json(error.toJSON(), { status: error.status });
	}
	console.error('Unexpected error:', error);
	return ctx.json({ error: 'Internal Server Error' }, { status: 500 });
});

await app.start();
