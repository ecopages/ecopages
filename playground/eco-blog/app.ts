import appConfig from './eco.config';
import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import { HttpError } from '@ecopages/core/errors';
import { auth } from './src/lib/auth';
import { dbService } from './src/lib/db';
import { BlogList } from './src/views/blog-list.kita';
import { BlogDetail } from './src/views/blog-detail.kita';
import { PostEditor } from './src/views/admin/post-editor.kita';
import { AdminPostList } from './src/views/admin/post-list.kita';
import { LoginView } from './src/views/auth/login.kita';
import { SignupView } from './src/views/auth/signup.kita';
import type { BunMiddleware } from '@ecopages/core/adapters/bun/create-app';
import type { ApiHandlerContext } from '@ecopages/core';

const app = new EcopagesApp({ appConfig: appConfig });

const authMiddleware: BunMiddleware<{ session: typeof auth.$Infer.Session }> = async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect('/login');
	}
	ctx.session = session;
	return next();
};

const authHandler = async (ctx: ApiHandlerContext<Bun.BunRequest<string>>) => {
	return auth.handler(ctx.request);
};

app.get('/api/auth/*', authHandler);
app.post('/api/auth/*', authHandler);

app.get('/login', async (ctx) => {
	return ctx.render(LoginView, {});
});

app.get('/signup', async (ctx) => {
	return ctx.render(SignupView, {});
});

app.get('/', async (ctx) => {
	const posts = dbService.getAllPosts();
	return ctx.render(BlogList, { posts });
});

app.get('/posts/:slug', async (ctx) => {
	const post = dbService.getPostBySlug(ctx.request.params.slug);
	if (!post) throw HttpError.NotFound('Post not found');
	return ctx.render(BlogDetail, { post });
});

app.group(
	'/admin',
	(r) => {
		r.get('/', async (ctx) => {
			const posts = dbService.getAllPosts();
			return ctx.render(AdminPostList, { posts });
		});

		r.get('/new', async (ctx) => {
			return ctx.render(PostEditor, {});
		});

		r.post('/posts', async (ctx) => {
			const formData = await ctx.request.formData();
			dbService.createPost({
				title: formData.get('title') as string,
				slug: formData.get('slug') as string,
				content: formData.get('content') as string,
				excerpt: (formData.get('excerpt') as string) || undefined,
			});
			return Response.redirect('/admin');
		});

		r.get('/posts/:id', async (ctx) => {
			const id = Number.parseInt(ctx.request.params.id);
			const posts = dbService.getAllPosts();
			const post = posts.find((p) => p.id === id);
			if (!post) throw HttpError.NotFound('Post not found');
			return ctx.render(PostEditor, { post });
		});

		r.post('/posts/:id', async (ctx) => {
			const id = Number.parseInt(ctx.request.params.id);
			const body = await ctx.request.formData();
			dbService.updatePost(id, {
				title: body.get('title') as string,
				slug: body.get('slug') as string,
				content: body.get('content') as string,
				excerpt: body.get('excerpt') as string,
			});
			return Response.redirect('/admin');
		});

		r.post('/posts/:id/delete', async (ctx) => {
			const id = Number.parseInt(ctx.request.params.id);
			dbService.deletePost(id);
			return Response.redirect('/admin');
		});
	},
	{
		middleware: [authMiddleware],
	},
);

await app.start();
