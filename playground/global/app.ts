import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import { defineApiHandler } from '@ecopages/core/adapters/bun/define-api-handler';
import appConfig from './eco.config';
import { getAllAuthorIds, getAllBlogPostSlugs, getAuthor, getBlogPost } from './src/mocks/data';

const app = new EcopagesApp({ appConfig });

app.get('/api/hello', async ({ response, appConfig }) => {
  return response.json({
    message: 'Hello world!',
    baseUrl: appConfig.baseUrl,
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

/**
 * Example of using defineApiHandler to create a strongly typed API handler for Bun.
 * This is useful for defining API routes with specific request and response types.
 * The handler is defined with a specific path and method, and it uses the BunRequest type
 * to ensure that the request parameters are correctly typed.
 */
const getAuthorApiHandler = defineApiHandler({
  method: 'GET',
  path: '/api/blog/author/:id',
  handler: async ({ request, response }) => {
    const { id } = request.params;
    const author = getAuthor(id);

    if (author) {
      return response.json(author);
    }

    return response.status(404).json({ error: 'Author not found' });
  },
});

app.get(getAuthorApiHandler.path, getAuthorApiHandler.handler);

app.get('/api/*', async ({ response }) => {
  return response.json({ message: 'Hello from the API! > /api/*' });
});

await app.start();
