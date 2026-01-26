import { EcopagesApp, type BunMiddleware } from '@ecopages/core/adapters/bun/create-app';
import { HttpError } from '@ecopages/core/errors';
import { z } from 'zod';
import appConfig from './eco.config';
import { PostView } from './src/views/post-view.kita';
import { PostListView } from './src/views/post-list-view.kita';
import { type Post, posts } from './src/data';

const app = new EcopagesApp({ appConfig: appConfig as any });

app.static('/', PostListView);
app.static('/posts', PostListView);
app.static('/posts/:slug', PostView);

app.group('/api/v1', (r) => {
	r.get('/posts', async (ctx) => {
		return ctx.json(posts);
	});

	r.get('/posts/:slug', async (ctx) => {
		const slug = ctx.request.params.slug;
		const post = posts.find((p) => p.slug === slug);
		if (!post) {
			throw HttpError.NotFound('Post not found');
		}
		return ctx.json(post);
	});
});

const adminMiddleware: BunMiddleware = async (ctx, next) => {
	console.log(`[Admin Access] ${ctx.request.method} ${ctx.request.url}`);
	return next();
};

app.group(
	'/api/v1/admin',
	(admin) => {
		admin.post(
			'/posts',
			async (ctx) => {
				const { title, content, slug } = ctx.body;

				if (posts.find((p) => p.slug === slug)) {
					throw HttpError.Conflict('Post with this slug already exists');
				}

				const newPost: Post = { title, content, slug };
				posts.push(newPost);

				return ctx.json(newPost, { status: 201 });
			},
			{
				schema: {
					body: z.object({
						slug: z
							.string()
							.min(3)
							.regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case'),
						title: z.string().min(5),
						content: z.string().min(10),
					}),
				},
			},
		);
	},
	{
		middleware: [adminMiddleware],
	},
);

app.get('/latest', async (ctx) => {
	const latestPost = posts[posts.length - 1];
	return ctx.render(PostView, latestPost);
});

app.onError((error, ctx) => {
	if (error instanceof HttpError) {
		return ctx.json(error.toJSON(), { status: error.status });
	}
	console.error('Unexpected error:', error);
	return ctx.json({ error: 'Internal Server Error' }, { status: 500 });
});

await app.start();
