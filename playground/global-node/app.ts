import { EcopagesApp } from '@ecopages/core/adapters/node/create-app';
import appConfig from './eco.config';
import { getAllAuthorIds, getAllBlogPostSlugs, getAuthor, getBlogPost } from './src/mocks/data.ts';

const app = new EcopagesApp({ appConfig });

app.get('/api/hello', async ({ response, request, server }) => {
	return response.json({
		message: 'Hello world!',
		requestIp: server.requestIP(request),
	});
});

app.get('/api/test/:id/subpath/:subpath', async ({ request, response }) => {
	const { id, subpath } = request.params;
	return response.json({ message: 'Hello from the API!', id, subpath });
});

app.get('/api/blog/posts', async ({ response }) => {
	const posts = getAllBlogPostSlugs();
	return response.json(posts);
});

app.get('/api/blog/post/:slug', async ({ request, response }) => {
	const { slug } = request.params;
	const post = getBlogPost(slug);

	if (post) {
		return response.json(post);
	}

	return response.status(404).json({ error: 'Post not found' });
});

app.get('/api/blog/authors', async ({ response }) => {
	const authors = getAllAuthorIds();
	return response.json(authors);
});

app.get('/api/blog/author/:id', async ({ request, response }) => {
	const { id } = request.params;
	const author = getAuthor(id);

	if (author) {
		return response.json(author);
	}

	return response.status(404).json({ error: 'Author not found' });
});

app.get('/api/*', async ({ response }) => {
	return response.json({ message: 'Hello from the API! > /api/*' });
});

await app.start();
