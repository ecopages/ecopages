import { EcopagesApp, type BunMiddleware } from '@ecopages/core/adapters/bun/create-app';
import { HttpError } from '@ecopages/core/errors';
import appConfig from './eco.config';
import * as pages from './src/handlers/pages';
import * as api from './src/handlers/api';
import * as admin from './src/handlers/admin';

const app = new EcopagesApp({ appConfig: appConfig as any });

app.static('/', pages.PostListPage);
app.static('/posts', pages.PostListPage);
app.static('/posts/:slug', pages.PostDetailPage);
app.get('/latest', pages.latest);

app.group('/api/v1', (r) => {
	r.get('/posts', api.list);
	r.get('/posts/:slug', api.detail);
});

const adminMiddleware: BunMiddleware = async (ctx, next) => {
	console.log(`[Admin Access] ${ctx.request.method} ${ctx.request.url}`);
	return next();
};

app.group(
	'/api/v1/admin',
	(r) => {
		r.post('/posts', admin.createPost, {
			schema: {
				body: admin.createPostSchema,
			},
		});
	},
	{
		middleware: [adminMiddleware],
	},
);

app.onError((error, ctx) => {
	if (error instanceof HttpError) {
		return ctx.json(error.toJSON(), { status: error.status });
	}
	console.error('Unexpected error:', error);
	return ctx.json({ error: 'Internal Server Error' }, { status: 500 });
});

await app.start();
